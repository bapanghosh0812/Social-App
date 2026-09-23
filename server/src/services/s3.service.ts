import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { MEDIA_SIGNING_KEY } from '../config/auth.js';

/**
 * Media storage.
 *
 *  - Uses AWS S3 when AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_S3_BUCKET
 *    are configured, otherwise the local disk (served from /uploads).
 *  - File types are detected from the file's magic bytes; the client-supplied
 *    MIME type and filename are never trusted. Stored names are random.
 *  - Verification documents are PRIVATE: they are never publicly reachable and
 *    can only be viewed through short-lived signed links issued to admins.
 */

const DATA_DIR = process.env.DB_DIR || path.join(process.cwd(), 'data');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(DATA_DIR, 'uploads');
const PRIVATE_DIR = process.env.PRIVATE_UPLOAD_DIR || path.join(DATA_DIR, 'private');

export type UploadFolder = 'posts' | 'reels' | 'stories' | 'avatars' | 'documents';
export type MediaKind = 'image' | 'video' | 'pdf';

interface FolderRule {
  kinds: MediaKind[];
  maxMb: number;
  isPrivate: boolean;
}

export const FOLDER_RULES: Record<UploadFolder, FolderRule> = {
  posts: { kinds: ['image', 'video'], maxMb: 60, isPrivate: false },
  reels: { kinds: ['video'], maxMb: env.maxUploadMb, isPrivate: false },
  stories: { kinds: ['image', 'video'], maxMb: 60, isPrivate: false },
  avatars: { kinds: ['image'], maxMb: 8, isPrivate: false },
  documents: { kinds: ['image', 'pdf'], maxMb: 15, isPrivate: true },
};

export function isUploadFolder(v: unknown): v is UploadFolder {
  return typeof v === 'string' && v in FOLDER_RULES;
}

export interface SniffResult {
  mime: string;
  ext: string;
  kind: MediaKind;
}

/** Identify a file from its leading bytes. Returns null for anything unsupported. */
export function sniffFile(buf: Buffer): SniffResult | null {
  if (buf.length < 12) return null;
  const ascii = (start: number, end: number) => buf.subarray(start, end).toString('latin1');

  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg', kind: 'image' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: 'image/png', ext: 'png', kind: 'image' };
  }
  if (ascii(0, 4) === 'GIF8') return { mime: 'image/gif', ext: 'gif', kind: 'image' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp', kind: 'image' };
  if (ascii(0, 5) === '%PDF-') return { mime: 'application/pdf', ext: 'pdf', kind: 'pdf' };
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return { mime: 'video/webm', ext: 'webm', kind: 'video' };
  }
  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (brand === 'avif' || brand === 'avis') return { mime: 'image/avif', ext: 'avif', kind: 'image' };
    if (['heic', 'heix', 'mif1', 'msf1', 'hevc'].includes(brand)) return null; // HEIC photos aren't web-displayable
    if (brand === 'qt  ') return { mime: 'video/quicktime', ext: 'mov', kind: 'video' };
    return { mime: 'video/mp4', ext: 'mp4', kind: 'video' };
  }
  return null;
}

const PUBLIC_KEY_RE = /^(posts|reels|stories|avatars)\/\d{4}\/[a-f0-9]{32}\.[a-z0-9]{2,5}$/;
const PRIVATE_KEY_RE = /^documents\/\d{4}\/[a-f0-9]{32}\.[a-z0-9]{2,5}$/;
export const PRIVATE_PREFIX = 'private:';

class MediaStorageService {
  private client: S3Client | null = null;
  private readonly bucket: string;
  private readonly publicBase: string;
  public readonly usingS3: boolean;

  constructor() {
    const { region, accessKeyId, secretAccessKey, bucket, cdnUrl } = env.aws;
    this.bucket = bucket;
    this.publicBase = cdnUrl || (bucket ? `https://${bucket}.s3.${region}.amazonaws.com` : '');

    if (accessKeyId && secretAccessKey && bucket) {
      this.client = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
      this.usingS3 = true;
      logger.info(`☁️ Media storage: AWS S3 (${region}/${bucket})`);
    } else {
      this.usingS3 = false;
      for (const dir of [UPLOAD_DIR, PRIVATE_DIR]) {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      }
      logger.info(`📁 Media storage: local disk (${UPLOAD_DIR}) served from /uploads`);
    }
  }

  private newKey(folder: UploadFolder, ext: string): string {
    return `${folder}/${new Date().getUTCFullYear()}/${crypto.randomBytes(16).toString('hex')}.${ext}`;
  }

  private localPath(root: string, key: string): string {
    const dest = path.resolve(root, key);
    if (!dest.startsWith(path.resolve(root) + path.sep)) throw new Error('Invalid storage path.');
    return dest;
  }

  /**
   * Store a validated upload. Returns a public URL, or `private:<key>` for
   * private folders.
   */
  async store(buffer: Buffer, folder: UploadFolder, sniffed: SniffResult): Promise<string> {
    const rule = FOLDER_RULES[folder];
    const key = this.newKey(folder, sniffed.ext);

    if (this.client) {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: sniffed.mime,
          CacheControl: rule.isPrivate ? 'private, no-store' : 'public, max-age=31536000, immutable',
          ContentDisposition: 'inline',
        })
      );
    } else {
      const dest = this.localPath(rule.isPrivate ? PRIVATE_DIR : UPLOAD_DIR, key);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, buffer, { mode: 0o640 });
    }

    return rule.isPrivate ? `${PRIVATE_PREFIX}${key}` : this.publicUrl(key);
  }

  publicUrl(key: string): string {
    return this.client ? `${this.publicBase}/${key}` : `/uploads/${key}`;
  }

  /** True when `url` points at a public file previously stored by this service. */
  isOwnPublicUrl(url: unknown, folders?: UploadFolder[]): url is string {
    if (typeof url !== 'string' || url.length > 500) return false;
    let key: string | null = null;
    if (url.startsWith('/uploads/')) key = url.slice('/uploads/'.length);
    else if (this.publicBase && url.startsWith(`${this.publicBase}/`)) key = url.slice(this.publicBase.length + 1);
    if (!key || !PUBLIC_KEY_RE.test(key)) return false;
    return !folders || folders.includes(key.split('/')[0] as UploadFolder);
  }

  /** Validate and extract the key from a `private:<key>` reference. */
  privateKeyFrom(ref: unknown): string | null {
    if (typeof ref !== 'string' || !ref.startsWith(PRIVATE_PREFIX)) return null;
    const key = ref.slice(PRIVATE_PREFIX.length);
    return PRIVATE_KEY_RE.test(key) ? key : null;
  }

  /** Short-lived link for viewing a private file (admins only). */
  async privateViewUrl(key: string, ttlSeconds = 600): Promise<string> {
    if (this.client) {
      return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: ttlSeconds });
    }
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    return `/api/media/private?key=${encodeURIComponent(key)}&exp=${exp}&sig=${this.sign(key, exp)}`;
  }

  sign(key: string, exp: number): string {
    return crypto.createHmac('sha256', MEDIA_SIGNING_KEY).update(`${key}:${exp}`).digest('base64url');
  }

  verifySignature(key: string, exp: number, sig: string): boolean {
    if (!PRIVATE_KEY_RE.test(key) || !Number.isFinite(exp) || exp < Date.now() / 1000) return false;
    const expected = Buffer.from(this.sign(key, exp));
    const given = Buffer.from(String(sig));
    return expected.length === given.length && crypto.timingSafeEqual(expected, given);
  }

  privateFilePath(key: string): string {
    return this.localPath(PRIVATE_DIR, key);
  }

  /**
   * Older builds stored verification documents in the PUBLIC uploads folder.
   * Move such a file into private storage and return its new private ref.
   */
  migrateLegacyDocument(url: string): string | null {
    if (this.client || !url.startsWith('/uploads/documents/')) return null;
    try {
      const src = this.localPath(UPLOAD_DIR, url.slice('/uploads/'.length));
      if (!fs.existsSync(src)) return null;
      const buf = fs.readFileSync(src);
      const sniffed = sniffFile(buf);
      fs.rmSync(src, { force: true });
      if (!sniffed) return null;
      const key = this.newKey('documents', sniffed.ext);
      const dest = this.localPath(PRIVATE_DIR, key);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, buf, { mode: 0o640 });
      return `${PRIVATE_PREFIX}${key}`;
    } catch (err) {
      logger.warn('Legacy document migration failed', { error: String(err) });
      return null;
    }
  }

  /** Best-effort removal of a stored public file. */
  async removePublic(url: string): Promise<void> {
    if (!this.isOwnPublicUrl(url)) return;
    const key = url.startsWith('/uploads/') ? url.slice('/uploads/'.length) : url.slice(this.publicBase.length + 1);
    try {
      if (this.client) await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
      else fs.rmSync(this.localPath(UPLOAD_DIR, key), { force: true });
    } catch (err) {
      logger.warn('Could not remove media file', { error: String(err) });
    }
  }
}

export const storage = new MediaStorageService();
export const LOCAL_UPLOAD_DIR = UPLOAD_DIR;
