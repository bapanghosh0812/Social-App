/**
 * Offline preview: an in-browser stand-in for the API.
 *
 * Used when the app is opened without a server (for example a web-only
 * Netlify deploy). It serves the demo campus captured in snapshot.json and
 * applies likes, comments, posts, follows, messages and so on in memory, so
 * every screen can be explored. Nothing leaves the device, no secrets are
 * involved, and everything resets on reload.
 */
import raw from './snapshot.json';
import { realtime } from '../services/realtime.js';

type Any = any;

export class PreviewError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
const fail = (status: number, message: string): never => {
  throw new PreviewError(status, message);
};

// --- Data (timestamps moved so the snapshot always looks fresh) ------------

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
function shift(v: Any, delta: number): Any {
  if (typeof v === 'string') return ISO_RE.test(v) ? new Date(Date.parse(v) + delta).toISOString() : v;
  if (Array.isArray(v)) return v.map((x) => shift(x, delta));
  if (v && typeof v === 'object') {
    const out: Any = {};
    for (const [k, x] of Object.entries(v)) out[k] = shift(x, delta);
    return out;
  }
  return v;
}

const S: Any = shift(raw, Date.now() - Date.parse((raw as Any).capturedAt));
const me: Any = S.me;
const ME: string = me.id;
const people: Record<string, Any> = { ...S.users, ...S.profiles };
const posts = new Map<string, Any>(S.posts.map(({ repost, ...p }: Any) => [p.id, p]));
const reels = new Map<string, Any>(S.reels.map((r: Any) => [r.id, r]));
let stories: Any[] = S.stories;
const comments: Record<string, Any[]> = S.comments;
const likes: Record<string, string[]> = S.likes;
const followers: Record<string, string[]> = S.followers;
const following: Record<string, string[]> = S.following;
let requests: string[] = S.requests;
const blocked = new Set<string>();
const convs = new Map<string, Any>(S.conversations.map((c: Any) => [c.id, c]));
const msgs: Record<string, Any[]> = {};
const otherRead: Record<string, string | null> = {};
for (const [id, m] of Object.entries<Any>(S.messages)) {
  msgs[id] = m.messages;
  otherRead[id] = m.otherLastReadAt;
}
const notifs: Any[] = S.notifications.notifications;
const jobs: Any[] = S.jobs;
const applied = new Set<string>(jobs.filter((j) => j.hasApplied).map((j) => j.id));
const tickets: Any[] = S.tickets;
const admin: Any = S.admin;
const uploads = new Map<string, string>();
const storyViewers: Record<string, Any[]> = {};
const docUrls: Record<string, string> = {};
const replySeq: Record<string, number> = {};
let live: Any = null;
let liveTimer: number | null = null;

// --- Helpers ----------------------------------------------------------------

const now = () => new Date().toISOString();
const nid = (p: string) => `${p}_${Math.random().toString(16).slice(2, 10)}${Date.now().toString(16).slice(-4)}`;
const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];
const later = (ms: number, fn: () => void) => window.setTimeout(fn, ms);
const emit = (msg: Any) => realtime.emitLocal(msg);
const newest = (a: Any, b: Any) => String(b.createdAt).localeCompare(String(a.createdAt));
const isVideo = (url: string) => uploads.get(url) === 'video' || /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url);

const MINI_KEYS = ['id', 'fullName', 'avatarUrl', 'collegeId', 'collegeName', 'verificationStatus', 'role', 'isPrivate', 'academicYear', 'companyName', 'headline', 'department', 'designation', 'followStatus', 'followersCount'];
function mini(id: string): Any {
  const p = people[id];
  if (!p) return null;
  const o: Any = {};
  for (const k of MINI_KEYS) if (p[k] !== undefined) o[k] = p[k];
  return o;
}
const minis = (ids: string[]) => ids.filter((id) => !blocked.has(id)).map(mini).filter(Boolean);
const others = () => Object.keys(people).filter((id) => id !== ME && !blocked.has(id) && people[id].verificationStatus === 'Verified Member');

function headlineFor(u: Any): string {
  if (u.headline) return u.headline;
  const college = (u.collegeName || '').split('(')[0].trim();
  if (u.role === 'faculty') return [[u.designation, u.department].filter(Boolean).join(', ') || 'Faculty', college].filter(Boolean).join(' · ');
  const batch = u.academicYear ? `Batch of ${String(u.academicYear).split('-')[1]}` : '';
  return ['Student', u.department, college, batch].filter(Boolean).join(' · ');
}

const lockedFor = (id: string) => id !== ME && people[id]?.isPrivate && people[id]?.followStatus !== 'following';
const visible = (id: string) => !blocked.has(id) && !lockedFor(id);

function presentReel(r: Any): Any {
  const a = people[r.authorId] || {};
  const fs = a.followStatus;
  return {
    ...r,
    authorName: a.fullName ?? r.authorName,
    authorAvatar: a.avatarUrl ?? r.authorAvatar,
    authorFollowStatus: r.authorId === ME ? null : fs === 'following' ? 'accepted' : fs === 'pending' ? 'pending' : null,
    commentsCount: (comments[`reel:${r.id}`] || []).filter((c) => !blocked.has(c.authorId)).length,
  };
}

function presentPost(p: Any, depth = 0): Any {
  const a = people[p.authorId] || {};
  let repost: Any;
  if (p.repostOf && depth === 0) {
    const o = p.repostOf.type === 'post' ? posts.get(p.repostOf.id) : reels.get(p.repostOf.id);
    repost = o && visible(o.authorId) ? (p.repostOf.type === 'post' ? presentPost(o, 1) : presentReel(o)) : null;
  }
  return {
    ...p,
    authorName: a.fullName ?? p.authorName,
    authorAvatar: a.avatarUrl ?? p.authorAvatar,
    authorHeadline: a.headline ?? p.authorHeadline,
    authorVerificationStatus: a.verificationStatus ?? p.authorVerificationStatus,
    commentsCount: (comments[`post:${p.id}`] || []).filter((c) => !blocked.has(c.authorId)).length,
    repost: p.repostOf ? repost ?? null : undefined,
  };
}

function presentStory(s: Any): Any {
  const isOwner = s.userId === ME;
  return { ...s, isOwner, viewsCount: isOwner ? (storyViewers[s.id] || []).length : undefined };
}

function paginate(list: Any[], cursor: string | null, limit: number) {
  const start = Number(cursor) || 0;
  const page = list.slice(start, start + limit);
  return { page, nextCursor: start + limit < list.length ? String(start + limit) : null };
}

const getPost = (id: string) => posts.get(id) || fail(404, 'Post not found.');
const getReel = (id: string) => reels.get(id) || fail(404, 'Reel not found.');
const getTarget = (type: string, id: string) => (type === 'post' ? getPost(id) : type === 'reel' ? getReel(id) : fail(400, 'Invalid target.'));

function setPostsCount(delta: number) {
  me.postsCount = Math.max(0, (me.postsCount || 0) + delta);
  people[ME].postsCount = me.postsCount;
}

// Fuzzy matching (typo tolerant, like the server's trigram search).
const norm = (s: string) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
function trigrams(s: string) {
  const out = new Set<string>();
  const p = `  ${s} `;
  for (let i = 0; i < p.length - 2; i++) out.add(p.slice(i, i + 3));
  return out;
}
function similarity(a: string, b: string) {
  const A = trigrams(a);
  const B = trigrams(b);
  let n = 0;
  A.forEach((x) => B.has(x) && n++);
  return n / (A.size + B.size - n || 1);
}
function score(query: string, fields: string[]): number {
  const q = norm(query);
  if (!q) return 1;
  const text = norm(fields.join(' '));
  if (text.includes(q)) return 1;
  const words = text.split(' ');
  const parts = q.split(' ').map((t) => Math.max(0, ...words.map((w) => (w.includes(t) ? 1 : similarity(t, w)))));
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

// --- Simulated activity (makes the demo feel alive) --------------------------

const unreadCount = () => notifs.filter((n) => !n.isRead).length;
function notify(n: Any) {
  const item = { id: nid('ntf'), isRead: false, createdAt: now(), actor: mini(n.actorId), actorFollowStatus: people[n.actorId]?.followStatus, ...n };
  notifs.unshift(item);
  emit({ type: 'NOTIFICATION', notification: item, unreadCount: unreadCount() });
}

function engage(type: 'post' | 'reel', id: string) {
  const thumb = type === 'reel' ? reels.get(id)?.thumbnailUrl : posts.get(id)?.mediaItems?.find((m: Any) => m.type === 'image')?.url;
  later(4000 + Math.random() * 2000, () => {
    const obj = type === 'post' ? posts.get(id) : reels.get(id);
    const who = pick(others());
    if (!obj || !who) return;
    const list = (likes[`${type}:${id}`] ||= []);
    if (list.includes(who)) return;
    list.unshift(who);
    obj.likesCount = (obj.likesCount || 0) + 1;
    notify({ type: 'like', actorId: who, targetType: type, targetId: id, thumbUrl: thumb, title: 'New like', message: `${people[who].fullName} liked your ${type}.` });
  });
  later(9000 + Math.random() * 3000, () => {
    const obj = type === 'post' ? posts.get(id) : reels.get(id);
    const who = pick(others());
    if (!obj || !who) return;
    const p = people[who];
    const text = pick(['This is great! 🔥', 'Love this 😍', 'Congrats! 👏', 'So proud of you 💯', 'Need the details on this!']);
    (comments[`${type}:${id}`] ||= []).push({
      id: nid('cmt'), postId: id, targetType: type, authorId: who, authorName: p.fullName, authorAvatar: p.avatarUrl, authorCollege: p.collegeName,
      authorHeadline: p.headline, authorRole: p.role, authorVerificationStatus: p.verificationStatus, content: text, createdAt: now(), likesCount: 0, isLikedByMe: false,
    });
    obj.commentsCount = comments[`${type}:${id}`].length;
    notify({ type: 'comment', actorId: who, targetType: type, targetId: id, thumbUrl: thumb, title: 'New comment', message: `${p.fullName} commented: ${text}` });
  });
}

function replyText(body: string, hasAttachment: boolean) {
  const t = body.toLowerCase();
  if (hasAttachment && !t) return pick(['Ooh, checking it out 👀', 'This is so good 🔥', 'Haha saving this!']);
  if (/\b(hi+|hey|hello|namaste|hlo)\b/.test(t)) return pick(['Hey! 👋 How are you?', "Hi! What's up? 🙂"]);
  if (/thank|thx|shukriya|dhanyavad/.test(t)) return pick(['Anytime! 🙌', 'Happy to help 😊']);
  if (t.includes('?')) return pick(['Good question — let me check and get back to you 🙂', "I think so! Let's discuss after class.", 'Will confirm by tonight 👍']);
  return pick(['Haha true 😄', 'Sounds good! 👍', 'Totally agree 💯', "Nice! Let's catch up soon.", "That's awesome 🔥"]);
}

function scheduleReply(c: Any, body: string, hasAttachment: boolean) {
  if (blocked.has(c.otherUserId)) return;
  const token = (replySeq[c.id] = (replySeq[c.id] || 0) + 1);
  const current = () => replySeq[c.id] === token;
  later(900, () => {
    if (!current()) return;
    otherRead[c.id] = now();
    emit({ type: 'MESSAGE_READ', conversationId: c.id, readAt: otherRead[c.id] });
  });
  later(1700, () => current() && emit({ type: 'TYPING', conversationId: c.id, userId: c.otherUserId }));
  later(3600, () => {
    if (!current()) return;
    const r = { id: nid('msg'), conversationId: c.id, senderId: c.otherUserId, body: replyText(body, hasAttachment), attachment: null, createdAt: now(), deleted: false };
    msgs[c.id].push(r);
    c.updatedAt = r.createdAt;
    c.unreadCount = (c.unreadCount || 0) + 1;
    emit({ type: 'MESSAGE_NEW', conversationId: c.id, message: r, from: mini(c.otherUserId) });
  });
}

const LIVE_LINES = ['Hello from Delhi! 👋', 'Audio is super clear 👌', 'Which lab is this?', '🔥🔥🔥', 'Love this!', 'Can you show the setup again?', 'Great session 👏', 'Joining from the library 📚'];
function startLiveSim() {
  if (liveTimer || !live) return;
  let tick = 0;
  liveTimer = window.setInterval(() => {
    if (!live) return stopLive();
    tick++;
    live.viewerCount = Math.max(0, Math.min(48, live.viewerCount + Math.round(Math.random() * 4 - 0.6)));
    emit({ type: 'LIVE_STATS', sessionId: live.id, viewerCount: live.viewerCount, likes: live.likes });
    const who = pick(others());
    if (tick % 2 === 0 && who) {
      emit({ type: 'LIVE_CHAT', sessionId: live.id, message: { id: nid('lc'), user: mini(who), text: pick(LIVE_LINES), createdAt: now() } });
    }
    if (Math.random() < 0.6) {
      live.likes += 1 + Math.floor(Math.random() * 3);
      emit({ type: 'LIVE_HEART', sessionId: live.id, likes: live.likes });
    }
  }, 2200);
}
function stopLive() {
  if (liveTimer) window.clearInterval(liveTimer);
  liveTimer = null;
  live = null;
}

/** Messages the app would normally send over the WebSocket. */
function onClientMessage(msg: Any) {
  if (!live || msg?.sessionId !== live.id) return;
  if (msg.type === 'LIVE_HOST_ATTACH') startLiveSim();
  if (msg.type === 'LIVE_CHAT' && String(msg.text || '').trim()) {
    emit({ type: 'LIVE_CHAT', sessionId: live.id, message: { id: nid('lc'), user: mini(ME), text: String(msg.text).slice(0, 200), createdAt: now() } });
  }
  if (msg.type === 'LIVE_HEART') {
    live.likes++;
    emit({ type: 'LIVE_HEART', sessionId: live.id, likes: live.likes });
  }
}

// --- Follow graph -----------------------------------------------------------

function setFollow(id: string, status: 'none' | 'pending' | 'following') {
  const t = people[id];
  const was = t.followStatus === 'following';
  const is = status === 'following';
  t.followStatus = status;
  t.isFollowedByMe = is;
  if (was === is) return;
  const d = is ? 1 : -1;
  t.followersCount = Math.max(0, (t.followersCount || 0) + d);
  me.followingCount = Math.max(0, (me.followingCount || 0) + d);
  people[ME].followingCount = me.followingCount;
  followers[id] = is ? [ME, ...(followers[id] || []).filter((x) => x !== ME)] : (followers[id] || []).filter((x) => x !== ME);
  following[ME] = is ? [id, ...(following[ME] || []).filter((x) => x !== id)] : (following[ME] || []).filter((x) => x !== id);
}

function removeFollower(id: string) {
  if (!(followers[ME] || []).includes(id)) return;
  followers[ME] = followers[ME].filter((x) => x !== id);
  people[id].followsMe = false;
  me.followersCount = Math.max(0, (me.followersCount || 0) - 1);
  people[ME].followersCount = me.followersCount;
}

// --- Messaging --------------------------------------------------------------

function presentConv(c: Any): Any {
  const list = msgs[c.id] || [];
  const last = list[list.length - 1] || null;
  return { ...c, otherUser: mini(c.otherUserId), lastMessage: last, updatedAt: last?.createdAt || c.updatedAt, otherLastReadAt: otherRead[c.id] ?? null, isBlocked: blocked.has(c.otherUserId) };
}

function convWith(userId: string): Any {
  if (!people[userId] || userId === ME) fail(404, 'User not found.');
  if (blocked.has(userId)) fail(403, "You can't message this account.");
  let c = [...convs.values()].find((x) => x.otherUserId === userId);
  if (!c) {
    c = { id: nid('conv'), otherUserId: userId, createdAt: now(), updatedAt: now(), unreadCount: 0, isOnline: Math.random() > 0.4 };
    convs.set(c.id, c);
    msgs[c.id] = [];
    otherRead[c.id] = null;
  }
  return c;
}

function resolveAttachment(raw: Any): Any {
  if (!raw) return null;
  const { type, id } = raw;
  if (type === 'post') {
    const p = getPost(id);
    return { type, id, title: String(p.content).slice(0, 120), thumbUrl: p.mediaUrls.find((u: string) => !isVideo(u)) || '', authorName: people[p.authorId]?.fullName };
  }
  if (type === 'reel') {
    const r = getReel(id);
    return { type, id, title: String(r.caption).slice(0, 120), thumbUrl: r.thumbnailUrl, authorName: people[r.authorId]?.fullName };
  }
  if (type === 'story') {
    const s = stories.find((x) => x.id === id) || fail(404, 'Story not found.');
    return { type, id, title: String(s.caption || '').slice(0, 120), thumbUrl: s.mediaType === 'image' ? s.mediaUrl : '', authorName: people[s.userId]?.fullName };
  }
  if (type === 'profile') {
    const u = people[id] || fail(404, 'User not found.');
    return { type, id, title: u.collegeName || u.companyName || '', thumbUrl: u.avatarUrl, authorName: u.fullName };
  }
  return fail(400, 'That item can no longer be shared.');
}

function deliver(c: Any, text: Any, rawAttachment: Any) {
  const body = typeof text === 'string' ? text.trim().slice(0, 2000) : '';
  const attachment = resolveAttachment(rawAttachment);
  if (!body && !attachment) fail(400, 'Message is empty.');
  const m = { id: nid('msg'), conversationId: c.id, senderId: ME, body, attachment, createdAt: now(), deleted: false };
  msgs[c.id].push(m);
  c.updatedAt = m.createdAt;
  scheduleReply(c, body, Boolean(attachment));
  return m;
}

// --- External reels (same allow-list as the server) -------------------------

function parseExternal(input: string): Any {
  let url: URL;
  try {
    url = new URL(String(input).trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase();
  const is = (d: string) => host === d || host.endsWith(`.${d}`);
  const sourceUrl = url.toString();
  if (is('youtube.com') || host === 'youtu.be') {
    let id: string | null = null;
    if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
    else if (/^\/(shorts|embed)\//.test(url.pathname)) id = url.pathname.split('/')[2];
    else if (url.pathname === '/watch') id = url.searchParams.get('v');
    if (!id || !/^[\w-]{11}$/.test(id)) return null;
    return { provider: 'youtube', videoUrl: `https://www.youtube-nocookie.com/embed/${id}`, thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, sourceUrl };
  }
  if (is('vimeo.com')) {
    const id = url.pathname.split('/').find((p) => /^\d{5,12}$/.test(p));
    return id ? { provider: 'vimeo', videoUrl: `https://player.vimeo.com/video/${id}`, thumbnailUrl: '', sourceUrl } : null;
  }
  if (is('instagram.com')) {
    const m = url.pathname.match(/^\/(?:reel|reels|p)\/([\w-]{5,40})/);
    return m ? { provider: 'instagram', videoUrl: `https://www.instagram.com/reel/${m[1]}/embed`, thumbnailUrl: '', sourceUrl } : null;
  }
  if (is('tiktok.com')) {
    const m = url.pathname.match(/\/video\/(\d{8,25})/);
    return m ? { provider: 'tiktok', videoUrl: `https://www.tiktok.com/embed/v2/${m[1]}`, thumbnailUrl: '', sourceUrl } : null;
  }
  if (/\.(mp4|webm|mov|m4v)$/i.test(url.pathname)) return { provider: 'direct', videoUrl: sourceUrl, thumbnailUrl: '', sourceUrl };
  return null;
}

function newPost(fields: Any): Any {
  const post = {
    id: nid('post'), authorId: ME, authorName: me.fullName, authorAvatar: me.avatarUrl, authorRole: me.role, authorVerificationStatus: me.verificationStatus,
    collegeId: me.collegeId, collegeName: me.collegeName, content: '', mediaUrls: [], mediaItems: [], mediaType: 'text', likesCount: 0, commentsCount: 0,
    sharesCount: 0, repostsCount: 0, createdAt: now(), isLikedByMe: false, isSavedByMe: false, isOwner: true, ...fields,
  };
  posts.set(post.id, post);
  setPostsCount(1);
  return post;
}

function toggleLike(type: string, obj: Any) {
  const list = (likes[`${type}:${obj.id}`] ||= []);
  const liked = list.includes(ME);
  if (liked) list.splice(list.indexOf(ME), 1);
  else list.unshift(ME);
  obj.isLikedByMe = !liked;
  obj.likesCount = Math.max(0, (obj.likesCount || 0) + (liked ? -1 : 1));
  return { isLikedByMe: obj.isLikedByMe, likesCount: obj.likesCount };
}

function docUrl(id: string): string | null {
  if (!S.docs[id]) return null;
  if (!docUrls[id]) {
    const bin = atob(S.docs[id]);
    docUrls[id] = URL.createObjectURL(new Blob([Uint8Array.from(bin, (ch) => ch.charCodeAt(0))], { type: 'application/pdf' }));
  }
  return docUrls[id];
}

// --- Routes -----------------------------------------------------------------

interface Ctx {
  q: URLSearchParams;
  body: Any;
  pin?: string;
}
type Handler = (params: string[], ctx: Ctx) => Any;
const routes: [string, RegExp, Handler][] = [];
const on = (method: string, pattern: string, handler: Handler) =>
  routes.push([method, new RegExp(`^${pattern.replace(/:\w+/g, '([^/]+)')}$`), handler]);
const needPin = (pin?: string) => /^\d{6}$/.test(pin || '') || fail(401, 'Enter the 6-digit admin PIN.');

export function session() {
  return { success: true, token: 'preview', sessionExpiresAt: Date.now() + 7 * 864e5, user: me, requiresOnboarding: false };
}

// Auth
on('GET', '/auth/config', () => ({ ...S.config }));
on('POST', '/auth/demo', () => session());
on('GET', '/auth/me', () => ({ user: me }));
on('POST', '/auth/logout', () => ({}));
on('POST', '/auth/logout-all', () => ({ message: 'Signed out of all other devices.' }));
on('POST', '/auth/onboarding', (_, { body }) => {
  for (const k of ['role', 'department', 'designation', 'fullName', 'gender', 'academicYear']) if (body[k]) me[k] = body[k];
  me.isProfileComplete = true;
  return { message: 'Profile saved.', user: me };
});

// Verification
on('GET', '/verification/status', () => S.verification);
on('POST', '/verification/upload-and-verify', () => ({
  message: "Document received. You're already a verified member.",
  data: { documentId: nid('vdoc'), status: me.verificationStatus },
}));

// Stories
on('GET', '/feed/stories', () => ({
  stories: stories.filter((s) => Date.parse(s.expiresAt) > Date.now() && visible(s.userId)).map(presentStory),
}));
on('POST', '/feed/stories', (_, { body }) => {
  let media = '';
  const ref = body.ref && ['post', 'reel'].includes(body.ref.type) ? { type: body.ref.type, id: body.ref.id } : undefined;
  if (ref?.type === 'reel') {
    const r = getReel(ref.id);
    media = ['upload', 'direct'].includes(r.provider) ? r.videoUrl : r.thumbnailUrl;
  } else if (ref?.type === 'post') media = getPost(ref.id).mediaUrls[0] || '';
  else media = typeof body.mediaUrl === 'string' ? body.mediaUrl : '';
  if (!media) fail(400, 'Please add a photo or video for your story.');
  const story = {
    id: nid('story'), userId: ME, userName: me.fullName, userAvatar: me.avatarUrl, collegeName: me.collegeName, mediaUrl: media,
    mediaType: isVideo(media) ? 'video' : 'image', caption: String(body.caption || '').slice(0, 300), ref, createdAt: now(),
    expiresAt: new Date(Date.now() + 864e5).toISOString(), seenByMe: true,
  };
  stories.unshift(story);
  later(5000, () => {
    storyViewers[story.id] = others().sort(() => Math.random() - 0.5).slice(0, 5).map((id) => ({ user: mini(id), viewedAt: now() }));
  });
  return { story: presentStory(story) };
});
on('DELETE', '/feed/stories/:id', ([id]) => {
  stories = stories.filter((s) => !(s.id === id && s.userId === ME));
  return {};
});
on('POST', '/feed/stories/:id/view', ([id]) => {
  const s = stories.find((x) => x.id === id);
  if (s) s.seenByMe = true;
  return {};
});
on('GET', '/feed/stories/:id/viewers', ([id]) => ({ viewers: storyViewers[id] || [] }));

// Feed
on('GET', '/feed/primary-college-pinned', (_, { q }) => ({ data: S.pinned[q.get('collegeId') || me.collegeId] || null }));
on('GET', '/feed/trending-tags', () => ({ tags: S.trendingTags }));
on('GET', '/feed/search', (_, { q }) => {
  const query = (q.get('q') || '').trim().toLowerCase();
  if (!query) return { posts: [] };
  const list = [...posts.values()].filter((p) => {
    if (!visible(p.authorId)) return false;
    const text = `${p.content} ${people[p.authorId]?.fullName || ''}`.toLowerCase();
    return query.startsWith('#') ? text.includes(query) : text.includes(query) || score(query, [p.content]) > 0.6;
  });
  return { posts: list.sort(newest).slice(0, 30).map((p) => presentPost(p)) };
});
on('GET', '/feed', (_, { q }) => {
  const limit = Math.min(Number(q.get('limit')) || 10, 30);
  const mode = q.get('mode') || 'forYou';
  const collegeId = q.get('collegeId');
  let list = [...posts.values()].filter((p) => visible(p.authorId));
  if (collegeId) list = list.filter((p) => p.collegeId === collegeId);
  else if (mode === 'following') {
    const f = new Set(following[ME] || []);
    list = list.filter((p) => p.authorId === ME || f.has(p.authorId));
  } else if (mode === 'campus') list = list.filter((p) => p.collegeId === me.collegeId);
  else if (me.mutedCollegeIds?.length) {
    const muted = new Set(me.mutedCollegeIds);
    list = list.filter((p) => !p.collegeId || !muted.has(p.collegeId) || p.authorId === ME);
  }
  const { page, nextCursor } = paginate(list.sort(newest), q.get('cursor'), limit);
  return { posts: page.map((p) => presentPost(p)), nextCursor, hasMore: nextCursor !== null, totalCount: list.length };
});
on('POST', '/feed', (_, { body }) => {
  const content = String(body.content || '').trim().slice(0, 5000);
  const media: string[] = Array.isArray(body.mediaUrls) ? body.mediaUrls.slice(0, 10) : [];
  if (!content && !media.length) fail(400, 'Post must contain text or media.');
  const items = media.map((url) => ({ url, type: isVideo(url) ? 'video' : 'image' }));
  const hasVideo = items.some((i) => i.type === 'video');
  const hasImage = items.some((i) => i.type === 'image');
  const post = newPost({ content, mediaUrls: media, mediaItems: items, mediaType: !items.length ? 'text' : hasVideo && hasImage ? 'mixed' : hasVideo ? 'video' : 'image' });
  engage('post', post.id);
  return { post: presentPost(post) };
});
on('GET', '/feed/:id', ([id]) => {
  const p = getPost(id);
  if (!visible(p.authorId)) fail(404, 'Post not found.');
  return { post: presentPost(p) };
});
on('PATCH', '/feed/:id', ([id], { body }) => {
  const p = getPost(id);
  if (p.authorId !== ME) fail(403, 'You can only edit your own posts.');
  p.content = String(body.content || '').trim().slice(0, 5000);
  p.editedAt = now();
  return { post: presentPost(p) };
});
on('DELETE', '/feed/:id', ([id]) => {
  const p = getPost(id);
  if (p.authorId !== ME) fail(403, 'You can only delete your own posts.');
  const orig = p.repostOf && (p.repostOf.type === 'post' ? posts.get(p.repostOf.id) : reels.get(p.repostOf.id));
  if (orig) orig.repostsCount = Math.max(0, (orig.repostsCount || 1) - 1);
  posts.delete(id);
  setPostsCount(-1);
  return { message: 'Post deleted.' };
});
on('POST', '/feed/:id/like', ([id]) => toggleLike('post', getPost(id)));
on('POST', '/feed/:id/save', ([id]) => {
  const p = getPost(id);
  p.isSavedByMe = !p.isSavedByMe;
  return { isSaved: p.isSavedByMe };
});
on('POST', '/feed/:id/share', ([id]) => {
  const p = getPost(id);
  p.sharesCount = (p.sharesCount || 0) + 1;
  return { sharesCount: p.sharesCount };
});
on('POST', '/feed/:id/repost', ([id], { body }) => {
  let target = getPost(id);
  if (target.repostOf?.type === 'post') target = getPost(target.repostOf.id);
  if (target.repostOf?.type === 'reel') fail(400, 'Reshare the original reel instead.');
  if (target.authorId === ME) fail(400, "You can't reshare your own post.");
  const existing = [...posts.values()].find((p) => p.authorId === ME && p.repostOf?.type === 'post' && p.repostOf.id === target.id);
  if (existing) {
    posts.delete(existing.id);
    setPostsCount(-1);
    target.repostsCount = Math.max(0, (target.repostsCount || 1) - 1);
    return { reposted: false, repostsCount: target.repostsCount };
  }
  const post = newPost({ content: String(body.caption || '').trim().slice(0, 1000), repostOf: { type: 'post', id: target.id } });
  target.repostsCount = (target.repostsCount || 0) + 1;
  return { reposted: true, repostsCount: target.repostsCount, post: presentPost(post) };
});
on('GET', '/feed/:id/likes', ([id]) => ({ users: minis(likes[`post:${id}`] || []) }));

// Comments
on('GET', '/comments/:type/:id', ([type, id]) => {
  const owner = getTarget(type, id).authorId;
  return {
    comments: (comments[`${type}:${id}`] || [])
      .filter((c) => !blocked.has(c.authorId))
      .map((c) => ({ ...c, canDelete: c.authorId === ME || owner === ME })),
  };
});
on('POST', '/comments/:type/:id', ([type, id], { body }) => {
  const target = getTarget(type, id);
  const content = String(body.content || '').trim().slice(0, 2000);
  if (!content) fail(400, 'Comment cannot be empty.');
  const p = people[ME];
  const comment = {
    id: nid('cmt'), postId: id, targetType: type, authorId: ME, authorName: me.fullName, authorAvatar: me.avatarUrl, authorCollege: me.collegeName,
    authorHeadline: p.headline, authorRole: me.role, authorVerificationStatus: me.verificationStatus, content, createdAt: now(), likesCount: 0, isLikedByMe: false,
  };
  (comments[`${type}:${id}`] ||= []).push(comment);
  target.commentsCount = comments[`${type}:${id}`].length;
  return { comment: { ...comment, canDelete: true }, commentsCount: target.commentsCount };
});
on('DELETE', '/comments/:type/:id/:cid', ([type, id, cid]) => {
  const target = getTarget(type, id);
  const list = comments[`${type}:${id}`] || [];
  const c = list.find((x) => x.id === cid) || fail(404, 'Comment not found.');
  if (c.authorId !== ME && target.authorId !== ME) fail(403, "You can't delete this comment.");
  comments[`${type}:${id}`] = list.filter((x) => x.id !== cid);
  target.commentsCount = comments[`${type}:${id}`].length;
  return { commentsCount: target.commentsCount };
});
on('POST', '/comments/:type/:id/:cid/like', ([type, id, cid]) => {
  const c = (comments[`${type}:${id}`] || []).find((x) => x.id === cid) || fail(404, 'Comment not found.');
  c.isLikedByMe = !c.isLikedByMe;
  c.likesCount = Math.max(0, (c.likesCount || 0) + (c.isLikedByMe ? 1 : -1));
  return { isLiked: c.isLikedByMe, likesCount: c.likesCount };
});

// Reels
on('GET', '/reels', (_, { q }) => {
  let list = [...reels.values()].filter((r) => visible(r.authorId)).sort(newest);
  const authorId = q.get('authorId');
  if (authorId) list = list.filter((r) => r.authorId === authorId);
  const startId = q.get('startId');
  const idx = startId ? list.findIndex((r) => r.id === startId) : -1;
  if (idx > 0) list = [list[idx], ...list.slice(0, idx), ...list.slice(idx + 1)];
  const cursor = q.get('cursor');
  const start = cursor ? list.findIndex((r) => r.id === cursor) + 1 : 0;
  const page = list.slice(start, start + 30);
  const nextCursor = start + 30 < list.length && page.length ? page[page.length - 1].id : null;
  return { reels: page.map(presentReel), nextCursor, total: list.length };
});
on('POST', '/reels', (_, { body }) => {
  let provider = 'upload';
  let videoUrl = typeof body.videoUrl === 'string' ? body.videoUrl : '';
  let thumbnailUrl = typeof body.thumbnailUrl === 'string' ? body.thumbnailUrl : '';
  let sourceUrl: string | undefined;
  if (body.externalUrl) {
    const ext = parseExternal(body.externalUrl) || fail(400, 'Paste a YouTube Shorts, Instagram, TikTok, Vimeo or direct .mp4 link.');
    ({ provider, videoUrl, sourceUrl } = ext);
    thumbnailUrl = thumbnailUrl || ext.thumbnailUrl;
  } else if (!videoUrl) fail(400, 'Please upload a video.');
  const track = String(body.musicTrack || 'Original audio').slice(0, 80);
  const reel = {
    id: nid('reel'), authorId: ME, authorName: me.fullName, authorAvatar: me.avatarUrl, authorCollege: me.collegeName, authorVerificationStatus: me.verificationStatus,
    videoUrl, thumbnailUrl, caption: String(body.caption || '').slice(0, 2200), musicTrack: track, audioTrack: track, provider, sourceUrl,
    likesCount: 0, commentsCount: 0, sharesCount: 0, viewsCount: 0, repostsCount: 0, createdAt: now(), isLikedByMe: false, isSavedByMe: false, isOwner: true,
  };
  reels.set(reel.id, reel);
  people[ME].reelsCount = (people[ME].reelsCount || 0) + 1;
  engage('reel', reel.id);
  return { reel: presentReel(reel) };
});
on('GET', '/reels/:id', ([id]) => ({ reel: presentReel(getReel(id)) }));
on('DELETE', '/reels/:id', ([id]) => {
  if (getReel(id).authorId !== ME) fail(403, 'You can only delete your own reels.');
  reels.delete(id);
  people[ME].reelsCount = Math.max(0, (people[ME].reelsCount || 1) - 1);
  return { message: 'Reel deleted.' };
});
on('POST', '/reels/:id/like', ([id]) => toggleLike('reel', getReel(id)));
on('POST', '/reels/:id/view', ([id]) => {
  const r = getReel(id);
  r.viewsCount = (r.viewsCount || 0) + 1;
  return { viewsCount: r.viewsCount };
});
on('POST', '/reels/:id/save', ([id]) => {
  const r = getReel(id);
  r.isSavedByMe = !r.isSavedByMe;
  return { isSaved: r.isSavedByMe };
});
on('POST', '/reels/:id/share', ([id]) => {
  const r = getReel(id);
  r.sharesCount = (r.sharesCount || 0) + 1;
  return { sharesCount: r.sharesCount };
});
on('POST', '/reels/:id/repost', ([id], { body }) => {
  const reel = getReel(id);
  if (reel.authorId === ME) fail(400, "You can't reshare your own reel.");
  const existing = [...posts.values()].find((p) => p.authorId === ME && p.repostOf?.type === 'reel' && p.repostOf.id === id);
  if (existing) {
    posts.delete(existing.id);
    setPostsCount(-1);
    reel.repostsCount = Math.max(0, (reel.repostsCount || 1) - 1);
    return { reposted: false, repostsCount: reel.repostsCount };
  }
  const post = newPost({ content: String(body.caption || '').trim().slice(0, 1000), repostOf: { type: 'reel', id } });
  reel.repostsCount = (reel.repostsCount || 0) + 1;
  return { reposted: true, repostsCount: reel.repostsCount, post: presentPost(post) };
});
on('GET', '/reels/:id/likes', ([id]) => ({ users: minis(likes[`reel:${id}`] || []) }));

// Colleges
on('GET', '/search', (_, { q }) => {
  const query = q.get('q') || '';
  const state = q.get('state');
  const type = q.get('type');
  const limit = Math.min(Number(q.get('limit')) || 20, 50);
  let list: Any[] = S.colleges.filter((c: Any) => (!state || c.state === state) && (!type || c.type === type));
  if (query) {
    list = list
      .map((c) => ({ c, s: score(query, [c.name, c.shortCode, c.city, c.state]) }))
      .filter((x) => x.s >= 0.45)
      .sort((a, b) => b.s - a.s)
      .map((x) => ({ ...x.c, matchScore: Math.round(x.s * 100) }));
  } else {
    list = [...list].sort((a, b) => (b.verifiedStudentCount || 0) - (a.verifiedStudentCount || 0) || (a.nirfRank || 999) - (b.nirfRank || 999));
  }
  return { results: list.slice(0, limit), count: list.length };
});
on('GET', '/search/:id', ([id]) => ({ college: S.colleges.find((c: Any) => c.id === id) || fail(404, 'College not found.') }));

// Users
on('GET', '/users/search', (_, { q }) => {
  const query = q.get('q') || '';
  if (!query.trim()) return { users: [] };
  const found = Object.keys(people)
    .filter((id) => id !== ME && !blocked.has(id))
    .map((id) => {
      const p = people[id];
      return { id, s: score(query, [p.fullName, p.headline, p.department, p.designation, p.collegeName, (p.skills || []).join(' ')]) };
    })
    .filter((x) => x.s >= 0.5)
    .sort((a, b) => b.s - a.s)
    .slice(0, 20);
  return { users: found.map((x) => mini(x.id)) };
});
on('GET', '/users/suggestions', () => ({ suggestions: minis(S.suggestions).filter((u: Any) => u.followStatus === 'none') }));
on('GET', '/users/me/requests', () => ({ requests: minis(requests) }));
on('GET', '/users/me/blocked', () => ({ users: [...blocked].map(mini).filter(Boolean) }));
on('GET', '/users/me/saved', () => ({
  posts: [...posts.values()].filter((p) => p.isSavedByMe && visible(p.authorId)).map((p) => presentPost(p)),
  reels: [...reels.values()].filter((r) => r.isSavedByMe && visible(r.authorId)).map(presentReel),
}));
on('PATCH', '/users/settings', (_, { body }) => {
  for (const k of ['bio', 'isPrivate', 'gender', 'avatarUrl', 'fullName', 'globalNotificationsEnabled', 'headline', 'department', 'designation']) {
    if (body[k] !== undefined) me[k] = typeof body[k] === 'string' ? body[k].trim() : body[k];
  }
  if (Array.isArray(body.skills)) {
    const seen = new Set<string>();
    me.skills = body.skills
      .map((s: Any) => String(s).trim().slice(0, 40))
      .filter((s: string) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()))
      .slice(0, 20);
  }
  me.updatedAt = now();
  Object.assign(people[ME], {
    fullName: me.fullName, avatarUrl: me.avatarUrl, bio: me.bio, isPrivate: me.isPrivate, gender: me.gender, department: me.department,
    designation: me.designation, skills: me.skills, customHeadline: me.headline || '', headline: headlineFor(me),
  });
  return { user: me };
});
on('POST', '/users/follow', (_, { body }) => {
  const shouldFollow = body.follow === undefined ? true : Boolean(body.follow);
  if (body.targetCollegeId) {
    const c = S.colleges.find((x: Any) => x.id === body.targetCollegeId) || fail(404, 'College not found.');
    me.collegeNotificationsEnabled = me.collegeNotificationsEnabled || {};
    if (shouldFollow) me.collegeNotificationsEnabled[c.id] = true;
    else delete me.collegeNotificationsEnabled[c.id];
    return { isFollowing: shouldFollow, targetCollegeId: c.id, message: shouldFollow ? `Following ${c.name}` : `Unfollowed ${c.name}` };
  }
  const id = String(body.targetUserId || '');
  const t = people[id];
  if (!t || id === ME || blocked.has(id)) fail(404, 'User not found.');
  let status: 'none' | 'pending' | 'following' = 'none';
  if (shouldFollow) {
    if (t.followStatus === 'following') status = 'following';
    else if (t.isPrivate) {
      if (t.followStatus !== 'pending') {
        later(6000, () => {
          if (people[id].followStatus !== 'pending') return;
          setFollow(id, 'following');
          notify({ type: 'follow_accept', actorId: id, targetType: 'user', targetId: id, title: 'Request accepted', message: `${t.fullName} accepted your follow request.` });
        });
      }
      status = 'pending';
    } else status = 'following';
  }
  setFollow(id, status);
  return {
    isFollowing: status === 'following',
    followStatus: status,
    followersCount: t.followersCount,
    followingCount: me.followingCount,
    message: status === 'pending' ? `Follow request sent to ${t.fullName}` : status === 'following' ? `Following ${t.fullName}` : `Unfollowed ${t.fullName}`,
  };
});
on('POST', '/users/requests/:id/:action', ([id, action]) => {
  requests = requests.filter((x) => x !== id);
  if (action === 'accept' && people[id]) {
    followers[ME] = [id, ...(followers[ME] || []).filter((x) => x !== id)];
    people[id].followsMe = true;
    me.followersCount = (me.followersCount || 0) + 1;
    people[ME].followersCount = me.followersCount;
  }
  return {};
});
on('DELETE', '/users/me/followers/:id', ([id]) => {
  removeFollower(id);
  return {};
});
on('POST', '/users/mute-college', (_, { body }) => {
  const set = new Set<string>(me.mutedCollegeIds || []);
  if (body.mute) set.add(body.collegeId);
  else set.delete(body.collegeId);
  me.mutedCollegeIds = [...set];
  return { mutedCollegeIds: me.mutedCollegeIds, message: body.mute ? 'You won’t see posts from this college in For you.' : 'College unmuted.' };
});
on('POST', '/users/notifications/toggle', (_, { body }) => {
  if (body.isGlobal) me.globalNotificationsEnabled = Boolean(body.enabled);
  else if (body.collegeId) me.collegeNotificationsEnabled = { ...(me.collegeNotificationsEnabled || {}), [body.collegeId]: Boolean(body.enabled) };
  return {};
});
on('POST', '/users/:id/block', ([id]) => {
  const t = people[id] || fail(404, 'User not found.');
  if (id === ME) fail(400, "You can't block yourself.");
  if (t.followStatus !== 'none') setFollow(id, 'none');
  removeFollower(id);
  blocked.add(id);
  emit({ type: 'BLOCKS_CHANGED' });
  return { message: `${t.fullName} is blocked.` };
});
on('DELETE', '/users/:id/block', ([id]) => {
  blocked.delete(id);
  emit({ type: 'BLOCKS_CHANGED' });
  return {};
});
on('GET', '/users/:id/followers', ([id]) => {
  if (lockedFor(id)) fail(403, 'This account is private.');
  return { users: minis(followers[id] || []) };
});
on('GET', '/users/:id/following', ([id]) => {
  if (lockedFor(id)) fail(403, 'This account is private.');
  return { users: minis(following[id] || []) };
});
on('GET', '/users/:id', ([id]) => {
  const p = people[id];
  if (!p || blocked.has(id)) fail(404, 'User not found.');
  const locked = lockedFor(id);
  return {
    profile: { ...p, isOwner: id === ME, followStatus: id === ME ? 'self' : p.followStatus, isLockedForViewer: locked },
    posts: locked ? [] : [...posts.values()].filter((x) => x.authorId === id).sort(newest).map((x) => presentPost(x)),
    reels: locked ? [] : [...reels.values()].filter((r) => r.authorId === id).sort(newest).map(presentReel),
  };
});

// Messages
const totalUnread = () => [...convs.values()].reduce((n, c) => n + (c.unreadCount || 0), 0);
on('GET', '/messages/conversations', () => ({
  conversations: [...convs.values()]
    .filter((c) => (msgs[c.id] || []).length)
    .map(presentConv)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))),
}));
on('GET', '/messages/unread-count', () => ({ count: totalUnread() }));
on('POST', '/messages/conversations', (_, { body }) => ({ conversation: presentConv(convWith(String(body.userId || ''))) }));
on('GET', '/messages/conversations/:id/messages', ([id], { q }) => {
  const list = msgs[id] || fail(404, 'Conversation not found.');
  const before = q.get('before');
  const older = before ? list.filter((m) => m.createdAt < before) : list;
  return { messages: older.slice(-40), hasMore: older.length > 40, otherLastReadAt: otherRead[id] ?? null };
});
on('POST', '/messages/conversations/:id/messages', ([id], { body }) => {
  const c = convs.get(id) || fail(404, 'Conversation not found.');
  if (blocked.has(c.otherUserId)) fail(403, "You can't message this account.");
  return { message: deliver(c, body.text, body.attachment) };
});
on('POST', '/messages/send', (_, { body }) => {
  const ids: string[] = Array.isArray(body.userIds) ? body.userIds.slice(0, 20) : [];
  let sent = 0;
  for (const uid of ids) {
    deliver(convWith(uid), body.text, body.attachment);
    sent++;
  }
  return { sent };
});
on('POST', '/messages/conversations/:id/read', ([id]) => {
  const c = convs.get(id);
  if (c) c.unreadCount = 0;
  return {};
});
on('DELETE', '/messages/messages/:id', ([id]) => {
  for (const list of Object.values(msgs)) {
    const m = list.find((x) => x.id === id && x.senderId === ME);
    if (m) Object.assign(m, { deleted: true, body: '', attachment: null });
  }
  return {};
});

// Notifications
on('GET', '/notifications', () => ({ notifications: notifs, unreadCount: unreadCount(), pendingRequests: requests.length }));
on('GET', '/notifications/counts', () => ({ notifications: unreadCount(), messages: totalUnread() }));
on('POST', '/notifications/read-all', () => {
  notifs.forEach((n) => (n.isRead = true));
  return {};
});
on('POST', '/notifications/:id/read', ([id]) => {
  const n = notifs.find((x) => x.id === id);
  if (n) n.isRead = true;
  return {};
});
on('DELETE', '/notifications/:id', ([id]) => {
  const i = notifs.findIndex((x) => x.id === id);
  if (i >= 0) notifs.splice(i, 1);
  return {};
});

// Live (camera works; the audience is simulated)
on('GET', '/live', () => ({ sessions: live ? [live] : [] }));
on('GET', '/live/ice-config', () => ({ iceServers: S.iceServers, maxViewers: 20 }));
on('GET', '/live/:id', ([id]) => ({ session: live && live.id === id ? live : fail(404, 'This live has ended.') }));
on('POST', '/live', (_, { body }) => {
  stopLive();
  live = { id: nid('live'), title: String(body.title || 'Campus Live').slice(0, 80), startedAt: now(), likes: 0, viewerCount: 0, host: mini(ME) };
  return { session: live, iceServers: S.iceServers };
});
on('POST', '/live/:id/end', () => {
  const total = live?.likes || 0;
  stopLive();
  return { likes: total };
});

// Reports
on('GET', '/reports/reasons', () => ({ reasons: S.reportReasons }));
on('POST', '/reports', (_, { body }) => {
  admin.reports?.unshift({
    id: nid('rpt'), reporterId: ME, reporterName: me.fullName, targetType: body.targetType, targetId: body.targetId, parentId: body.parentId,
    reason: body.reason, details: body.details || '', snapshot: '', status: 'open', createdAt: now(), owner: null,
  });
  return { message: 'Thanks for reporting. Our team will review it.' };
});

// Placements
on('GET', '/placements/jobs', (_, { q }) => {
  const type = q.get('type');
  const search = (q.get('search') || '').toLowerCase();
  const list = jobs
    .filter((j) => (!type || type === 'All' || j.jobType === type) && (q.get('mine') !== 'true' || j.recruiterId === ME))
    .filter((j) => !search || `${j.jobTitle} ${j.companyName} ${j.location} ${(j.tags || []).join(' ')}`.toLowerCase().includes(search))
    .map((j) => ({ ...j, hasApplied: applied.has(j.id), isMine: j.recruiterId === ME }));
  return { count: list.length, jobs: list };
});
on('POST', '/placements/verify-corporate', () => ({ validFormat: true, message: 'Format looks valid.' }));
on('POST', '/placements/jobs', () => fail(403, 'Only verified faculty, placement officers and recruiters can post openings.'));
on('POST', '/placements/jobs/:id/apply', ([id]) => {
  const j = jobs.find((x) => x.id === id) || fail(404, 'This opening is no longer available.');
  if (!applied.has(id)) {
    applied.add(id);
    j.applicationCount = (j.applicationCount || 0) + 1;
  }
  const subject = encodeURIComponent(`Application: ${j.jobTitle} — ${me.fullName}`);
  const text = encodeURIComponent(`Hello ${j.companyName} team,\n\nI'd like to apply for the ${j.jobTitle} role.\n\nName: ${me.fullName}\nCollege: ${me.collegeName}\nBatch: ${me.academicYear || '-'}\n\nThank you!`);
  return { applied: true, applicationCount: j.applicationCount, mailto: `mailto:${j.officialCompanyEmail}?subject=${subject}&body=${text}` };
});

// Support
on('GET', '/support/tickets', () => ({ tickets }));
on('POST', '/support/tickets', (_, { body }) => {
  if (!String(body.subject || '').trim() || !String(body.description || '').trim()) fail(400, 'Please add a subject and a description.');
  const ticket = {
    id: `TCK-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, userId: ME, userName: me.fullName, userEmail: me.email, category: body.category || 'Other',
    subject: String(body.subject).slice(0, 140), description: String(body.description).slice(0, 4000), priority: body.priority || 'Medium', status: 'Open', createdAt: now(),
  };
  tickets.unshift(ticket);
  return { ticket };
});

// Admin console (sample data; any 6-digit PIN opens it in preview)
const allTickets = () => [...new Map([...tickets, ...(admin.tickets || [])].map((t: Any) => [t.id, t])).values()];
on('POST', '/admin/unlock', (_, { pin }) => needPin(pin) && { message: 'Admin console unlocked.' });
on('GET', '/admin/stats', (_, { pin }) => {
  needPin(pin);
  const all = Object.values(people);
  return {
    stats: {
      users: all.length, verifiedMembers: all.filter((u) => u.verificationStatus === 'Verified Member').length, posts: posts.size, reels: reels.size,
      pendingVerifications: (admin.verifications || []).filter((d: Any) => d.status === 'Pending').length,
      openReports: (admin.reports || []).filter((r: Any) => r.status === 'open').length,
      openTickets: allTickets().filter((t) => t.status !== 'Resolved').length,
    },
  };
});
on('GET', '/admin/verifications', (_, { pin }) => {
  needPin(pin);
  const documents = (admin.verifications || []).filter((d: Any) => d.status === 'Pending').map((d: Any) => ({ ...d, documentViewUrl: docUrl(d.id) }));
  return { count: documents.length, documents };
});
on('POST', '/admin/verifications/:id/:action', ([id, action], { body, pin }) => {
  needPin(pin);
  const d = (admin.verifications || []).find((x: Any) => x.id === id) || fail(404, 'Document not found.');
  const u = people[d.userId];
  if (action === 'approve') {
    d.status = 'Approved';
    if (u) u.verificationStatus = 'Verified Member';
    return { message: `${d.userName} is now a verified member.` };
  }
  d.status = 'Rejected';
  d.rejectionReason = body.reason;
  if (u) u.verificationStatus = 'Rejected';
  return { message: `${d.userName}'s document was rejected.` };
});
on('GET', '/admin/reports', (_, { pin }) => {
  needPin(pin);
  return { reports: [...(admin.reports || [])].sort((a, b) => Number(b.status === 'open') - Number(a.status === 'open') || newest(a, b)) };
});
on('POST', '/admin/reports/:id/:action', ([id, action], { pin }) => {
  needPin(pin);
  const r = (admin.reports || []).find((x: Any) => x.id === id) || fail(404, 'Report not found.');
  r.status = action === 'remove' ? 'actioned' : 'dismissed';
  if (action === 'remove') {
    if (r.targetType === 'post') posts.delete(r.targetId);
    if (r.targetType === 'reel') reels.delete(r.targetId);
  }
  return { message: action === 'remove' ? 'Content removed.' : 'Report dismissed.' };
});
on('GET', '/admin/tickets', (_, { pin }) => needPin(pin) && { tickets: allTickets() });
on('PATCH', '/admin/tickets/:id', ([id], { body, pin }) => {
  needPin(pin);
  const t = allTickets().find((x) => x.id === id) || fail(404, 'Ticket not found.');
  if (body.status) t.status = body.status;
  if (body.adminNote !== undefined) t.adminNote = body.adminNote;
  t.updatedAt = now();
  return { ticket: t };
});
on('POST', '/admin/colleges/:id/pinned', ([id], { body, pin }) => {
  needPin(pin);
  const c = S.colleges.find((x: Any) => x.id === id) || fail(404, 'College not found.');
  const data = (S.pinned[id] ||= { collegeId: id, collegeName: c.name, shortCode: c.shortCode, announcementsCount: 0, noticeBoard: [], todaysPlanning: [], clubHighlights: [] });
  const section = ['noticeBoard', 'todaysPlanning', 'clubHighlights'].includes(body.section) ? body.section : fail(400, 'Unknown section.');
  data[section].unshift({ id: nid('pin'), publishedAt: now(), isPinned: true, ...body.item });
  data.announcementsCount = data.noticeBoard.length;
  return { data };
});
on('DELETE', '/admin/colleges/:id/pinned/:section/:item', ([id, section, item], { pin }) => {
  needPin(pin);
  const data = S.pinned[id] || fail(404, 'Nothing pinned for this college.');
  data[section] = (data[section] || []).filter((x: Any) => x.id !== item);
  data.announcementsCount = data.noticeBoard.length;
  return { data };
});

// --- Entry points -----------------------------------------------------------

/** Handle one API call. Resolves with the same JSON the server would send. */
export async function handle(method: string, endpoint: string, body?: Any, pin?: string): Promise<Any> {
  await new Promise((r) => setTimeout(r, 80 + Math.random() * 140));
  const url = new URL(endpoint, 'https://preview.local');
  for (const [m, re, handler] of routes) {
    if (m !== method) continue;
    const match = url.pathname.match(re);
    if (!match) continue;
    const out = handler(match.slice(1).map(decodeURIComponent), { q: url.searchParams, body: body || {}, pin });
    return JSON.parse(JSON.stringify({ success: true, ...out }));
  }
  return fail(503, 'This needs the live server — it isn’t available in preview mode.');
}

/** Store an upload in memory and return a local URL for it. */
export function registerUpload(file: Blob): { success: boolean; url: string; kind: 'image' | 'video' | 'pdf' } {
  const kind = file.type.startsWith('video/') ? 'video' : file.type === 'application/pdf' ? 'pdf' : file.type.startsWith('image/') ? 'image' : fail(400, 'Only photos, videos and PDFs can be uploaded.');
  const url = URL.createObjectURL(file);
  uploads.set(url, kind);
  return { success: true, url, kind };
}

export function stop() {
  stopLive();
  realtime.useLocal(null);
}

realtime.useLocal(onClientMessage);
