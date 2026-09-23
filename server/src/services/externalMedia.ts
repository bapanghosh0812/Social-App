import { ReelProvider } from '../types/index.js';

/**
 * Turns a link pasted by a user into a safely playable reel source.
 *
 * Only https links on an explicit allow-list of hosts are accepted, and the
 * embed URL is rebuilt from the extracted ID — the user's URL is never used
 * as an iframe src directly, so arbitrary sites can't be framed.
 */

export interface ExternalVideo {
  provider: Exclude<ReelProvider, 'upload'>;
  videoUrl: string; // direct file URL or rebuilt embed URL
  thumbnailUrl: string;
  sourceUrl: string;
}

const DIRECT_EXT_RE = /\.(mp4|webm|mov|m4v)$/i;

function hostIs(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function parseExternalVideo(input: unknown): ExternalVideo | null {
  if (typeof input !== 'string' || input.length > 600) return null;
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  const sourceUrl = url.toString();

  // YouTube: /shorts/ID, /watch?v=ID, /embed/ID, youtu.be/ID
  if (hostIs(host, 'youtube.com') || host === 'youtu.be') {
    let id: string | null = null;
    if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
    else if (url.pathname.startsWith('/shorts/')) id = url.pathname.split('/')[2];
    else if (url.pathname.startsWith('/embed/')) id = url.pathname.split('/')[2];
    else if (url.pathname === '/watch') id = url.searchParams.get('v');
    if (!id || !/^[\w-]{11}$/.test(id)) return null;
    return {
      provider: 'youtube',
      videoUrl: `https://www.youtube-nocookie.com/embed/${id}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      sourceUrl,
    };
  }

  // Vimeo: vimeo.com/123456
  if (hostIs(host, 'vimeo.com')) {
    const id = url.pathname.split('/').find((p) => /^\d{5,12}$/.test(p));
    if (!id) return null;
    return { provider: 'vimeo', videoUrl: `https://player.vimeo.com/video/${id}`, thumbnailUrl: '', sourceUrl };
  }

  // Instagram: /reel/CODE, /reels/CODE, /p/CODE
  if (hostIs(host, 'instagram.com')) {
    const m = url.pathname.match(/^\/(?:reel|reels|p)\/([\w-]{5,40})/);
    if (!m) return null;
    return { provider: 'instagram', videoUrl: `https://www.instagram.com/reel/${m[1]}/embed`, thumbnailUrl: '', sourceUrl };
  }

  // TikTok: /@user/video/ID
  if (hostIs(host, 'tiktok.com')) {
    const m = url.pathname.match(/\/video\/(\d{8,25})/);
    if (!m) return null;
    return { provider: 'tiktok', videoUrl: `https://www.tiktok.com/embed/v2/${m[1]}`, thumbnailUrl: '', sourceUrl };
  }

  // Direct video file on any https host.
  if (DIRECT_EXT_RE.test(url.pathname)) {
    return { provider: 'direct', videoUrl: sourceUrl, thumbnailUrl: '', sourceUrl };
  }

  return null;
}

/** Only https image URLs are accepted as external thumbnails. */
export function safeHttpsUrl(input: unknown): string {
  if (typeof input !== 'string' || input.length > 600) return '';
  try {
    const u = new URL(input);
    return u.protocol === 'https:' && !u.username && !u.password ? u.toString() : '';
  } catch {
    return '';
  }
}
