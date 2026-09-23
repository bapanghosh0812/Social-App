import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { logger } from '../config/logger.js';

/**
 * Durable local persistence engine.
 *
 * Everything is stored in a single SQLite file (WAL mode for crash-safety and
 * concurrent reads). Entity collections are stored as JSON documents in simple
 * `(id TEXT PRIMARY KEY, data TEXT)` key-value tables and mirrored into an
 * in-memory Map at boot for fast synchronous reads. Relational tables hold the
 * data that must be queried by relationship rather than by primary key.
 * All SQL uses bound parameters — user input is never interpolated.
 */

const DB_DIR = process.env.DB_DIR || path.join(process.cwd(), 'data');
const DB_PATH = process.env.DB_PATH || path.join(DB_DIR, 'campus.db');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

export const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

// --- Key-Value document tables (one per entity collection) ---
export const KV_TABLES = [
  'users',
  'posts',
  'comments',
  'reels',
  'verification_documents',
  'support_tickets',
  'notifications',
  'pinned_feeds',
  'colleges',
  'stories',
  'jobs',
  'reports',
] as const;

for (const table of KV_TABLES) {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS kv_${table} (id TEXT PRIMARY KEY, data TEXT NOT NULL)`);
}

// --- Relational tables ---
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS credentials (
    email          TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL,
    password_hash  TEXT NOT NULL,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS follows (
    follower_id   TEXT NOT NULL,
    following_id  TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    PRIMARY KEY (follower_id, following_id)
  );

  CREATE TABLE IF NOT EXISTS post_likes (
    user_id    TEXT NOT NULL,
    post_id    TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, post_id)
  );

  CREATE TABLE IF NOT EXISTS reel_likes (
    user_id    TEXT NOT NULL,
    reel_id    TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, reel_id)
  );

  CREATE TABLE IF NOT EXISTS comment_likes (
    user_id    TEXT NOT NULL,
    comment_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, comment_id)
  );

  CREATE TABLE IF NOT EXISTS bookmarks (
    user_id    TEXT NOT NULL,
    item_type  TEXT NOT NULL,
    item_id    TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, item_type, item_id)
  );

  CREATE TABLE IF NOT EXISTS blocks (
    blocker_id TEXT NOT NULL,
    blocked_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (blocker_id, blocked_id)
  );

  CREATE TABLE IF NOT EXISTS reel_views (
    user_id   TEXT NOT NULL,
    reel_id   TEXT NOT NULL,
    viewed_at TEXT NOT NULL,
    PRIMARY KEY (user_id, reel_id)
  );

  CREATE TABLE IF NOT EXISTS story_views (
    user_id   TEXT NOT NULL,
    story_id  TEXT NOT NULL,
    viewed_at TEXT NOT NULL,
    PRIMARY KEY (user_id, story_id)
  );

  CREATE TABLE IF NOT EXISTS user_notifications (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    data       TEXT NOT NULL,
    is_read    INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id         TEXT PRIMARY KEY,
    pair_key   TEXT NOT NULL UNIQUE,
    user_a     TEXT NOT NULL,
    user_b     TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS conversation_reads (
    conversation_id TEXT NOT NULL,
    user_id         TEXT NOT NULL,
    last_read_at    TEXT NOT NULL,
    PRIMARY KEY (conversation_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    sender_id       TEXT NOT NULL,
    body            TEXT NOT NULL,
    attachment      TEXT,
    created_at      TEXT NOT NULL,
    deleted         INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS password_resets (
    token_hash TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used       INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS job_applications (
    user_id    TEXT NOT NULL,
    job_id     TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, job_id)
  );

  CREATE TABLE IF NOT EXISTS app_secrets (
    key         TEXT PRIMARY KEY,
    hash        TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_follows_following ON follows (following_id);
  CREATE INDEX IF NOT EXISTS idx_post_likes_post ON post_likes (post_id);
  CREATE INDEX IF NOT EXISTS idx_reel_likes_reel ON reel_likes (reel_id);
  CREATE INDEX IF NOT EXISTS idx_comment_likes_comment ON comment_likes (comment_id);
  CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks (blocked_id);
  CREATE INDEX IF NOT EXISTS idx_reel_views_reel ON reel_views (reel_id);
  CREATE INDEX IF NOT EXISTS idx_story_views_story ON story_views (story_id);
  CREATE INDEX IF NOT EXISTS idx_notif_user ON user_notifications (user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages (conversation_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_conv_a ON conversations (user_a);
  CREATE INDEX IF NOT EXISTS idx_conv_b ON conversations (user_b);
  CREATE INDEX IF NOT EXISTS idx_job_apps_job ON job_applications (job_id);
`);

// --- Lightweight migrations ---
function hasColumn(table: string, column: string): boolean {
  const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
}
if (!hasColumn('follows', 'status')) {
  sqlite.exec(`ALTER TABLE follows ADD COLUMN status TEXT NOT NULL DEFAULT 'accepted'`);
}

/**
 * A Map that transparently persists every write to a SQLite key-value table.
 * Reads are served entirely from memory; writes are mirrored to disk
 * synchronously so a process restart restores the exact same state.
 */
export class PersistentMap<V> extends Map<string, V> {
  private readonly upsertStmt: Database.Statement;
  private readonly deleteStmt: Database.Statement;

  constructor(private readonly table: (typeof KV_TABLES)[number]) {
    super();
    const t = `kv_${table}`;
    this.upsertStmt = sqlite.prepare(
      `INSERT INTO ${t} (id, data) VALUES (@id, @data)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data`
    );
    this.deleteStmt = sqlite.prepare(`DELETE FROM ${t} WHERE id = @id`);
    this.hydrate();
  }

  private hydrate(): void {
    const rows = sqlite.prepare(`SELECT id, data FROM kv_${this.table}`).all() as {
      id: string;
      data: string;
    }[];
    for (const row of rows) {
      try {
        super.set(row.id, JSON.parse(row.data) as V);
      } catch (err) {
        logger.error(`Failed to hydrate ${this.table}/${row.id}`, { error: String(err) });
      }
    }
  }

  set(key: string, value: V): this {
    this.upsertStmt.run({ id: key, data: JSON.stringify(value) });
    return super.set(key, value);
  }

  delete(key: string): boolean {
    this.deleteStmt.run({ id: key });
    return super.delete(key);
  }
}

const nowIso = () => new Date().toISOString();

// --- Auth credential store (never serialized into API responses) ---
export interface CredentialRow {
  email: string;
  userId: string;
  passwordHash: string;
}

export const credentials = {
  findByEmail(email: string): CredentialRow | null {
    const row = sqlite
      .prepare('SELECT email, user_id, password_hash FROM credentials WHERE email = ?')
      .get(email.toLowerCase().trim()) as
      | { email: string; user_id: string; password_hash: string }
      | undefined;
    if (!row) return null;
    return { email: row.email, userId: row.user_id, passwordHash: row.password_hash };
  },
  create(email: string, userId: string, passwordHash: string): void {
    const now = nowIso();
    sqlite
      .prepare(
        `INSERT INTO credentials (email, user_id, password_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(email.toLowerCase().trim(), userId, passwordHash, now, now);
  },
  updatePassword(email: string, passwordHash: string): void {
    sqlite
      .prepare('UPDATE credentials SET password_hash = ?, updated_at = ? WHERE email = ?')
      .run(passwordHash, nowIso(), email.toLowerCase().trim());
  },
  exists(email: string): boolean {
    return Boolean(sqlite.prepare('SELECT 1 FROM credentials WHERE email = ?').get(email.toLowerCase().trim()));
  },
  remove(email: string): void {
    sqlite.prepare('DELETE FROM credentials WHERE email = ?').run(email.toLowerCase().trim());
  },
};

// --- Follow graph (with private-account requests) ---
export type FollowStatus = 'accepted' | 'pending';

export const follows = {
  add(followerId: string, followingId: string, status: FollowStatus = 'accepted'): void {
    sqlite
      .prepare(
        `INSERT INTO follows (follower_id, following_id, created_at, status) VALUES (?, ?, ?, ?)
         ON CONFLICT(follower_id, following_id) DO UPDATE SET status = excluded.status`
      )
      .run(followerId, followingId, nowIso(), status);
  },
  remove(followerId: string, followingId: string): void {
    sqlite.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').run(followerId, followingId);
  },
  status(followerId: string, followingId: string): FollowStatus | null {
    const r = sqlite
      .prepare('SELECT status FROM follows WHERE follower_id = ? AND following_id = ?')
      .get(followerId, followingId) as { status: FollowStatus } | undefined;
    return r?.status ?? null;
  },
  isFollowing(followerId: string, followingId: string): boolean {
    return this.status(followerId, followingId) === 'accepted';
  },
  followersCount(userId: string): number {
    return (
      sqlite
        .prepare(`SELECT COUNT(*) AS c FROM follows WHERE following_id = ? AND status = 'accepted'`)
        .get(userId) as { c: number }
    ).c;
  },
  followingCount(userId: string): number {
    return (
      sqlite
        .prepare(`SELECT COUNT(*) AS c FROM follows WHERE follower_id = ? AND status = 'accepted'`)
        .get(userId) as { c: number }
    ).c;
  },
  followerIds(userId: string): string[] {
    return (
      sqlite
        .prepare(`SELECT follower_id AS id FROM follows WHERE following_id = ? AND status = 'accepted' ORDER BY created_at DESC`)
        .all(userId) as { id: string }[]
    ).map((r) => r.id);
  },
  followingIds(userId: string): string[] {
    return (
      sqlite
        .prepare(`SELECT following_id AS id FROM follows WHERE follower_id = ? AND status = 'accepted' ORDER BY created_at DESC`)
        .all(userId) as { id: string }[]
    ).map((r) => r.id);
  },
  pendingRequestIds(userId: string): string[] {
    return (
      sqlite
        .prepare(`SELECT follower_id AS id FROM follows WHERE following_id = ? AND status = 'pending' ORDER BY created_at DESC`)
        .all(userId) as { id: string }[]
    ).map((r) => r.id);
  },
  acceptAllPending(userId: string): void {
    sqlite.prepare(`UPDATE follows SET status = 'accepted' WHERE following_id = ? AND status = 'pending'`).run(userId);
  },
  removeAllFor(userId: string): void {
    sqlite.prepare('DELETE FROM follows WHERE follower_id = ? OR following_id = ?').run(userId, userId);
  },
};

// --- Per-user like state (posts, reels, comments) ---
function makeLikeStore(table: 'post_likes' | 'reel_likes' | 'comment_likes', col: 'post_id' | 'reel_id' | 'comment_id') {
  return {
    add(userId: string, itemId: string): void {
      sqlite
        .prepare(`INSERT INTO ${table} (user_id, ${col}, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING`)
        .run(userId, itemId, nowIso());
    },
    remove(userId: string, itemId: string): void {
      sqlite.prepare(`DELETE FROM ${table} WHERE user_id = ? AND ${col} = ?`).run(userId, itemId);
    },
    isLiked(userId: string, itemId: string): boolean {
      return Boolean(sqlite.prepare(`SELECT 1 FROM ${table} WHERE user_id = ? AND ${col} = ?`).get(userId, itemId));
    },
    count(itemId: string): number {
      return (sqlite.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE ${col} = ?`).get(itemId) as { c: number }).c;
    },
    likerIds(itemId: string, limit = 50): string[] {
      return (
        sqlite
          .prepare(`SELECT user_id AS id FROM ${table} WHERE ${col} = ? ORDER BY created_at DESC LIMIT ?`)
          .all(itemId, limit) as { id: string }[]
      ).map((r) => r.id);
    },
    removeAllForUser(userId: string): void {
      sqlite.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId);
    },
    removeAllForItem(itemId: string): void {
      sqlite.prepare(`DELETE FROM ${table} WHERE ${col} = ?`).run(itemId);
    },
  };
}

export const postLikes = makeLikeStore('post_likes', 'post_id');
export const reelLikes = makeLikeStore('reel_likes', 'reel_id');
export const commentLikes = makeLikeStore('comment_likes', 'comment_id');

// --- Saved items ---
export type BookmarkType = 'post' | 'reel';
export const bookmarks = {
  toggle(userId: string, type: BookmarkType, itemId: string): boolean {
    if (this.has(userId, type, itemId)) {
      sqlite.prepare('DELETE FROM bookmarks WHERE user_id = ? AND item_type = ? AND item_id = ?').run(userId, type, itemId);
      return false;
    }
    sqlite
      .prepare('INSERT INTO bookmarks (user_id, item_type, item_id, created_at) VALUES (?, ?, ?, ?)')
      .run(userId, type, itemId, nowIso());
    return true;
  },
  has(userId: string, type: BookmarkType, itemId: string): boolean {
    return Boolean(
      sqlite.prepare('SELECT 1 FROM bookmarks WHERE user_id = ? AND item_type = ? AND item_id = ?').get(userId, type, itemId)
    );
  },
  list(userId: string, type: BookmarkType): string[] {
    return (
      sqlite
        .prepare('SELECT item_id AS id FROM bookmarks WHERE user_id = ? AND item_type = ? ORDER BY created_at DESC')
        .all(userId, type) as { id: string }[]
    ).map((r) => r.id);
  },
  removeAllForItem(type: BookmarkType, itemId: string): void {
    sqlite.prepare('DELETE FROM bookmarks WHERE item_type = ? AND item_id = ?').run(type, itemId);
  },
  removeAllForUser(userId: string): void {
    sqlite.prepare('DELETE FROM bookmarks WHERE user_id = ?').run(userId);
  },
};

// --- Blocks ---
export const blocks = {
  add(blockerId: string, blockedId: string): void {
    sqlite
      .prepare('INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING')
      .run(blockerId, blockedId, nowIso());
  },
  remove(blockerId: string, blockedId: string): void {
    sqlite.prepare('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?').run(blockerId, blockedId);
  },
  isBlocked(blockerId: string, blockedId: string): boolean {
    return Boolean(sqlite.prepare('SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?').get(blockerId, blockedId));
  },
  /** True when either user has blocked the other. */
  eitherBlocked(a: string, b: string): boolean {
    return Boolean(
      sqlite
        .prepare('SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)')
        .get(a, b, b, a)
    );
  },
  /** Every user id hidden from `userId` (blocked by them or blocking them). */
  hiddenFor(userId: string): Set<string> {
    const rows = sqlite
      .prepare(
        `SELECT blocked_id AS id FROM blocks WHERE blocker_id = ?
         UNION SELECT blocker_id AS id FROM blocks WHERE blocked_id = ?`
      )
      .all(userId, userId) as { id: string }[];
    return new Set(rows.map((r) => r.id));
  },
  blockedBy(userId: string): string[] {
    return (
      sqlite.prepare('SELECT blocked_id AS id FROM blocks WHERE blocker_id = ? ORDER BY created_at DESC').all(userId) as {
        id: string;
      }[]
    ).map((r) => r.id);
  },
  removeAllFor(userId: string): void {
    sqlite.prepare('DELETE FROM blocks WHERE blocker_id = ? OR blocked_id = ?').run(userId, userId);
  },
};

// --- Unique views (reels, stories) ---
function makeViewStore(table: 'reel_views' | 'story_views', col: 'reel_id' | 'story_id') {
  return {
    add(userId: string, itemId: string): boolean {
      const r = sqlite
        .prepare(`INSERT INTO ${table} (user_id, ${col}, viewed_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING`)
        .run(userId, itemId, nowIso());
      return r.changes > 0;
    },
    has(userId: string, itemId: string): boolean {
      return Boolean(sqlite.prepare(`SELECT 1 FROM ${table} WHERE user_id = ? AND ${col} = ?`).get(userId, itemId));
    },
    count(itemId: string): number {
      return (sqlite.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE ${col} = ?`).get(itemId) as { c: number }).c;
    },
    viewers(itemId: string): { userId: string; viewedAt: string }[] {
      return (
        sqlite
          .prepare(`SELECT user_id AS userId, viewed_at AS viewedAt FROM ${table} WHERE ${col} = ? ORDER BY viewed_at DESC`)
          .all(itemId) as { userId: string; viewedAt: string }[]
      );
    },
    removeAllForItem(itemId: string): void {
      sqlite.prepare(`DELETE FROM ${table} WHERE ${col} = ?`).run(itemId);
    },
    removeAllForUser(userId: string): void {
      sqlite.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId);
    },
  };
}
export const reelViews = makeViewStore('reel_views', 'reel_id');
export const storyViews = makeViewStore('story_views', 'story_id');

// --- Job applications ---
export const jobApplications = {
  add(userId: string, jobId: string): boolean {
    const r = sqlite
      .prepare('INSERT INTO job_applications (user_id, job_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING')
      .run(userId, jobId, nowIso());
    return r.changes > 0;
  },
  has(userId: string, jobId: string): boolean {
    return Boolean(sqlite.prepare('SELECT 1 FROM job_applications WHERE user_id = ? AND job_id = ?').get(userId, jobId));
  },
  count(jobId: string): number {
    return (sqlite.prepare('SELECT COUNT(*) AS c FROM job_applications WHERE job_id = ?').get(jobId) as { c: number }).c;
  },
  removeAllForUser(userId: string): void {
    sqlite.prepare('DELETE FROM job_applications WHERE user_id = ?').run(userId);
  },
};

// --- Password reset tokens (only hashes are stored) ---
export const passwordResets = {
  create(tokenHash: string, userId: string, ttlMs: number): void {
    sqlite.prepare('DELETE FROM password_resets WHERE user_id = ?').run(userId);
    sqlite
      .prepare('INSERT INTO password_resets (token_hash, user_id, expires_at, used) VALUES (?, ?, ?, 0)')
      .run(tokenHash, userId, Date.now() + ttlMs);
  },
  consume(tokenHash: string): string | null {
    const row = sqlite
      .prepare('SELECT user_id, expires_at, used FROM password_resets WHERE token_hash = ?')
      .get(tokenHash) as { user_id: string; expires_at: number; used: number } | undefined;
    if (!row || row.used || row.expires_at < Date.now()) return null;
    sqlite.prepare('UPDATE password_resets SET used = 1 WHERE token_hash = ?').run(tokenHash);
    return row.user_id;
  },
  purgeExpired(): void {
    sqlite.prepare('DELETE FROM password_resets WHERE expires_at < ? OR used = 1').run(Date.now());
  },
};

// --- App secrets (hashed admin credentials; never returned to clients) ---
export const secrets = {
  get(key: string): { hash: string } | null {
    const row = sqlite.prepare('SELECT hash FROM app_secrets WHERE key = ?').get(key) as { hash: string } | undefined;
    return row ?? null;
  },
  set(key: string, hash: string): void {
    sqlite
      .prepare(
        `INSERT INTO app_secrets (key, hash, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET hash = excluded.hash, updated_at = excluded.updated_at`
      )
      .run(key, hash, nowIso());
  },
  has(key: string): boolean {
    return Boolean(sqlite.prepare('SELECT 1 FROM app_secrets WHERE key = ?').get(key));
  },
  remove(key: string): void {
    sqlite.prepare('DELETE FROM app_secrets WHERE key = ?').run(key);
  },
};

// --- Small app metadata flags ---
export const meta = {
  get(key: string): string | null {
    const r = sqlite.prepare('SELECT value FROM app_meta WHERE key = ?').get(key) as { value: string } | undefined;
    return r?.value ?? null;
  },
  set(key: string, value: string): void {
    sqlite
      .prepare('INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, value);
  },
  remove(key: string): void {
    sqlite.prepare('DELETE FROM app_meta WHERE key = ?').run(key);
  },
};

logger.info(`💾 SQLite persistence engine ready at ${DB_PATH} (WAL mode)`);
