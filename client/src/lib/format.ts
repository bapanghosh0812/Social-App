/** Compact relative time: now, 5m, 3h, 2d, 3w, or a date. */
export function timeAgo(iso?: string): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 45) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${Math.max(1, m)}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  if (d < 35) return `${Math.floor(d / 7)}w`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** Long relative time for detail views. */
export function timeAgoLong(iso?: string): string {
  const short = timeAgo(iso);
  if (short === 'now') return 'Just now';
  const map: Record<string, string> = { m: 'minute', h: 'hour', d: 'day', w: 'week' };
  const match = short.match(/^(\d+)([mhdw])$/);
  if (!match) return short;
  const n = Number(match[1]);
  return `${n} ${map[match[2]]}${n === 1 ? '' : 's'} ago`;
}

/** 1.2K / 3.4M style counts. */
export function compact(n?: number): string {
  const v = n || 0;
  if (v < 1000) return String(v);
  if (v < 1_000_000) return `${(v / 1000).toFixed(v < 10_000 ? 1 : 0).replace(/\.0$/, '')}K`;
  return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function firstName(name?: string): string {
  return (name || '').trim().split(/\s+/)[0] || '';
}

export function shortCollege(name?: string): string {
  return (name || '').split('(')[0].trim();
}

export function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

/** Split text into plain / #hashtag / @mention parts for rich rendering. */
export function tokenize(text: string): { kind: 'text' | 'tag' | 'mention'; value: string }[] {
  const parts: { kind: 'text' | 'tag' | 'mention'; value: string }[] = [];
  const re = /(#[\p{L}\p{N}_]{2,40})|(@[\p{L}\p{N}_]{2,40})/gu;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) parts.push({ kind: 'text', value: text.slice(last, idx) });
    parts.push({ kind: m[1] ? 'tag' : 'mention', value: m[0] });
    last = idx + m[0].length;
  }
  if (last < text.length) parts.push({ kind: 'text', value: text.slice(last) });
  return parts;
}

export function shareUrl(kind: 'post' | 'reel' | 'user' | 'live', id: string): string {
  return `${window.location.origin}/?${kind}=${encodeURIComponent(id)}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
