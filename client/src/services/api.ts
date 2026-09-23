import type {
  User, College, Post, Reel, Comment, VerificationDocument, SupportTicket, PinnedCollegeFeed,
  JobPosting, CampusStory, MiniUser, NotificationItem, Conversation, ChatMessage, LiveSession,
  ProfileData, Report, MessageAttachment,
} from '../types/index.js';

/**
 * API client. In the browser the API is same-origin (/api via the dev proxy or
 * nginx). Native builds set VITE_API_ORIGIN (e.g. https://api.yourdomain.com).
 */
const API_ORIGIN = ((import.meta as any).env?.VITE_API_ORIGIN as string | undefined)?.replace(/\/+$/, '') || '';
const API_BASE = `${API_ORIGIN}/api`;
const TOKEN_KEY = 'cc_token';

export function wsUrl(): string {
  if (API_ORIGIN) return `${API_ORIGIN.replace(/^http/, 'ws')}/ws/v1`;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/v1`;
}

/** Resolve relative media paths (/uploads/…, /api/media/…) against the API origin. */
export function mediaUrl(url?: string | null): string {
  if (!url) return '';
  if (url.startsWith('/') && API_ORIGIN) return `${API_ORIGIN}${url}`;
  return url;
}

// --- Offline preview (runs the demo campus in the browser when no server is connected) ---
const PREVIEW_KEY = 'cc_preview';
let previewModule: Promise<typeof import('../demo/previewServer.js')> | null = null;
const loadPreview = () => (previewModule ||= import('../demo/previewServer.js'));

export function isPreview(): boolean {
  try {
    return localStorage.getItem(PREVIEW_KEY) === '1';
  } catch {
    return false;
  }
}
export async function startPreview(): Promise<AuthResult> {
  try {
    localStorage.setItem(PREVIEW_KEY, '1');
  } catch {
    /* storage unavailable — preview lasts for this page only */
  }
  return (await loadPreview()).session() as AuthResult;
}
export function stopPreview(): void {
  try {
    localStorage.removeItem(PREVIEW_KEY);
  } catch {
    /* ignore */
  }
  previewModule?.then((m) => m.stop());
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage unavailable */
  }
}
export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

const SERVER_UNREACHABLE = "Can't reach the College Campus server. Check your connection and try again.";

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type Json = Record<string, any>;

export interface AuthResult {
  success: boolean;
  token: string;
  sessionExpiresAt: number;
  user: User;
  isNewUser?: boolean;
  requiresOnboarding: boolean;
  message?: string;
}

export interface AuthConfig {
  demoMode: boolean;
  googleClientId: string | null;
  passwordReset: boolean;
  emailDelivery: boolean;
  adminConsole: boolean;
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

class ApiClient {
  private async request<T = Json>(endpoint: string, options: RequestInit & { adminPin?: string } = {}): Promise<T> {
    const { adminPin, ...init } = options;
    if (isPreview()) {
      const preview = await loadPreview();
      try {
        const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
        return (await preview.handle(init.method || 'GET', endpoint, body, adminPin)) as T;
      } catch (err: any) {
        throw new ApiError(err?.message || 'Something went wrong.', err?.status || 500);
      }
    }
    const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
    if (init.body && !(init.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (adminPin) headers['x-admin-pin'] = adminPin;

    let response: Response;
    try {
      response = await fetch(`${API_BASE}${endpoint}`, { ...init, headers });
    } catch {
      throw new ApiError(SERVER_UNREACHABLE, 0, 'API_UNREACHABLE');
    }

    let data: any = null;
    try {
      data = await response.json();
    } catch {
      /* non-JSON response */
    }
    // Every API reply is JSON. HTML or an empty body means we reached a static
    // host (e.g. a web-only deploy) or a proxy error page, not the API.
    if (data === null) throw new ApiError(SERVER_UNREACHABLE, 0, 'API_UNREACHABLE');

    if (!response.ok) {
      if (response.status === 401 && token) {
        clearToken();
        onUnauthorized?.();
      }
      throw new ApiError((data && (data.message || data.error)) || `Request failed (${response.status}).`, response.status, data?.code);
    }
    return data as T;
  }

  private get<T = Json>(path: string, adminPin?: string) {
    return this.request<T>(path, { adminPin });
  }
  private send<T = Json>(method: string, path: string, body?: unknown, adminPin?: string) {
    return this.request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body), adminPin });
  }

  // --- Auth ---
  authConfig() {
    return this.get<{ success: boolean } & AuthConfig>('/auth/config');
  }
  register(payload: { fullName: string; email: string; password: string }) {
    return this.send<AuthResult>('POST', '/auth/register', payload);
  }
  login(payload: { email: string; password: string }) {
    return this.send<AuthResult>('POST', '/auth/login', payload);
  }
  demoLogin() {
    return this.send<AuthResult>('POST', '/auth/demo');
  }
  googleLogin(credential: string) {
    return this.send<AuthResult>('POST', '/auth/google', { credential });
  }
  forgotPassword(email: string) {
    return this.send<{ success: boolean; message: string }>('POST', '/auth/forgot-password', { email });
  }
  resetPassword(token: string, newPassword: string) {
    return this.send<AuthResult>('POST', '/auth/reset-password', { token, newPassword });
  }
  changePassword(currentPassword: string, newPassword: string) {
    return this.send<AuthResult>('POST', '/auth/change-password', { currentPassword, newPassword });
  }
  async logout() {
    try {
      await this.send('POST', '/auth/logout');
    } catch {
      /* best-effort */
    }
  }
  logoutAll() {
    return this.send<{ success: boolean; message: string }>('POST', '/auth/logout-all');
  }
  getCurrentUser() {
    return this.get<{ success: boolean; user: User }>('/auth/me');
  }
  deleteAccount(confirmation: string) {
    return this.send<{ success: boolean; message: string }>('DELETE', '/auth/account', { confirmation });
  }
  submitOnboarding(data: Json) {
    return this.send<{ success: boolean; message: string; user: User }>('POST', '/auth/onboarding', data);
  }

  // --- Verification ---
  uploadAndVerifyDocument(payload: { documentType: string; documentUrl: string; academicYear?: string }) {
    return this.send<{ success: boolean; message: string; data: { documentId: string; status: string } }>(
      'POST',
      '/verification/upload-and-verify',
      payload
    );
  }
  getVerificationStatus() {
    return this.get<{
      success: boolean;
      verificationStatus: string;
      document: { documentType: string; status: string; submittedAt: string; rejectionReason?: string } | null;
    }>('/verification/status');
  }

  // --- Feed & posts ---
  getFeed(opts: { cursor?: string; mode?: string; collegeId?: string; limit?: number } = {}) {
    const p = new URLSearchParams();
    if (opts.cursor) p.set('cursor', opts.cursor);
    if (opts.mode) p.set('mode', opts.mode);
    if (opts.collegeId) p.set('collegeId', opts.collegeId);
    p.set('limit', String(opts.limit || 10));
    return this.get<{ success: boolean; posts: Post[]; nextCursor: string | null; hasMore: boolean }>(`/feed?${p}`);
  }
  getPost(postId: string) {
    return this.get<{ success: boolean; post: Post }>(`/feed/${encodeURIComponent(postId)}`);
  }
  createPost(payload: { content: string; mediaUrls?: string[] }) {
    return this.send<{ success: boolean; post: Post }>('POST', '/feed', payload);
  }
  editPost(postId: string, content: string) {
    return this.send<{ success: boolean; post: Post }>('PATCH', `/feed/${postId}`, { content });
  }
  deletePost(postId: string) {
    return this.send('DELETE', `/feed/${postId}`);
  }
  toggleLikePost(postId: string) {
    return this.send<{ success: boolean; isLikedByMe: boolean; likesCount: number }>('POST', `/feed/${postId}/like`);
  }
  toggleSavePost(postId: string) {
    return this.send<{ success: boolean; isSaved: boolean }>('POST', `/feed/${postId}/save`);
  }
  sharePost(postId: string) {
    return this.send<{ success: boolean; sharesCount: number }>('POST', `/feed/${postId}/share`);
  }
  repostPost(postId: string, caption = '') {
    return this.send<{ success: boolean; reposted: boolean; repostsCount: number; post?: Post }>('POST', `/feed/${postId}/repost`, { caption });
  }
  getPostLikes(postId: string) {
    return this.get<{ success: boolean; users: MiniUser[] }>(`/feed/${postId}/likes`);
  }
  getPinnedPrimaryCollege(collegeId?: string) {
    return this.get<{ success: boolean; data: PinnedCollegeFeed | null }>(
      `/feed/primary-college-pinned${collegeId ? `?collegeId=${encodeURIComponent(collegeId)}` : ''}`
    );
  }
  getTrendingTags() {
    return this.get<{ success: boolean; tags: { tag: string; count: number }[] }>('/feed/trending-tags');
  }
  searchPosts(q: string) {
    return this.get<{ success: boolean; posts: Post[] }>(`/feed/search?q=${encodeURIComponent(q)}`);
  }

  // --- Comments (posts & reels) ---
  getComments(type: 'post' | 'reel', id: string) {
    return this.get<{ success: boolean; comments: Comment[] }>(`/comments/${type}/${id}`);
  }
  addComment(type: 'post' | 'reel', id: string, content: string) {
    return this.send<{ success: boolean; comment: Comment; commentsCount: number }>('POST', `/comments/${type}/${id}`, { content });
  }
  deleteComment(type: 'post' | 'reel', id: string, commentId: string) {
    return this.send<{ success: boolean; commentsCount: number }>('DELETE', `/comments/${type}/${id}/${commentId}`);
  }
  likeComment(type: 'post' | 'reel', id: string, commentId: string) {
    return this.send<{ success: boolean; isLiked: boolean; likesCount: number }>('POST', `/comments/${type}/${id}/${commentId}/like`);
  }

  // --- Stories ---
  getStories() {
    return this.get<{ success: boolean; stories: CampusStory[] }>('/feed/stories');
  }
  createStory(payload: { mediaUrl?: string; caption?: string; ref?: { type: 'post' | 'reel'; id: string } }) {
    return this.send<{ success: boolean; story: CampusStory }>('POST', '/feed/stories', payload);
  }
  deleteStory(storyId: string) {
    return this.send('DELETE', `/feed/stories/${storyId}`);
  }
  viewStory(storyId: string) {
    return this.send('POST', `/feed/stories/${storyId}/view`);
  }
  getStoryViewers(storyId: string) {
    return this.get<{ success: boolean; viewers: { user: MiniUser; viewedAt: string }[] }>(`/feed/stories/${storyId}/viewers`);
  }

  // --- Reels ---
  getReels(opts: { cursor?: string; startId?: string; authorId?: string } = {}) {
    const p = new URLSearchParams();
    if (opts.cursor) p.set('cursor', opts.cursor);
    if (opts.startId) p.set('startId', opts.startId);
    if (opts.authorId) p.set('authorId', opts.authorId);
    return this.get<{ success: boolean; reels: Reel[]; nextCursor: string | null; total: number }>(`/reels?${p}`);
  }
  getReel(reelId: string) {
    return this.get<{ success: boolean; reel: Reel }>(`/reels/${encodeURIComponent(reelId)}`);
  }
  createReel(payload: { videoUrl?: string; externalUrl?: string; thumbnailUrl?: string; caption?: string; musicTrack?: string }) {
    return this.send<{ success: boolean; reel: Reel }>('POST', '/reels', payload);
  }
  deleteReel(reelId: string) {
    return this.send('DELETE', `/reels/${reelId}`);
  }
  toggleLikeReel(reelId: string) {
    return this.send<{ success: boolean; isLikedByMe: boolean; likesCount: number }>('POST', `/reels/${reelId}/like`);
  }
  viewReel(reelId: string) {
    return this.send<{ success: boolean; viewsCount: number }>('POST', `/reels/${reelId}/view`);
  }
  toggleSaveReel(reelId: string) {
    return this.send<{ success: boolean; isSaved: boolean }>('POST', `/reels/${reelId}/save`);
  }
  shareReel(reelId: string) {
    return this.send<{ success: boolean; sharesCount: number }>('POST', `/reels/${reelId}/share`);
  }
  getReelLikes(reelId: string) {
    return this.get<{ success: boolean; users: MiniUser[] }>(`/reels/${reelId}/likes`);
  }
  repostReel(reelId: string, caption = '') {
    return this.send<{ success: boolean; reposted: boolean; repostsCount: number }>('POST', `/reels/${reelId}/repost`, { caption });
  }

  // --- Search & colleges ---
  searchColleges(query = '', state?: string, type?: string) {
    const p = new URLSearchParams();
    if (query) p.set('q', query);
    if (state && state !== 'All') p.set('state', state);
    if (type && type !== 'All') p.set('type', type);
    return this.get<{ success: boolean; results: College[]; count: number }>(`/search?${p}`);
  }
  getCollegeHub(collegeId: string) {
    return this.get<{ success: boolean; college: College }>(`/search/${encodeURIComponent(collegeId)}`);
  }

  // --- Users ---
  searchUsers(q: string) {
    return this.get<{ success: boolean; users: MiniUser[] }>(`/users/search?q=${encodeURIComponent(q)}`);
  }
  getSuggestions() {
    return this.get<{ success: boolean; suggestions: MiniUser[] }>('/users/suggestions');
  }
  getUserProfile(userId: string) {
    return this.get<{ success: boolean; profile: ProfileData; posts: Post[]; reels: Reel[] }>(`/users/${encodeURIComponent(userId)}`);
  }
  getFollowList(userId: string, list: 'followers' | 'following') {
    return this.get<{ success: boolean; users: MiniUser[] }>(`/users/${userId}/${list}`);
  }
  updateProfileSettings(
    payload: Partial<
      Pick<User, 'bio' | 'isPrivate' | 'gender' | 'avatarUrl' | 'fullName' | 'globalNotificationsEnabled' | 'headline' | 'department' | 'designation' | 'skills'>
    >
  ) {
    return this.send<{ success: boolean; user: User }>('PATCH', '/users/settings', payload);
  }
  follow(payload: { targetUserId?: string; targetCollegeId?: string; follow?: boolean; notificationPreference?: string }) {
    return this.send<{ success: boolean; isFollowing: boolean; followStatus?: 'none' | 'pending' | 'following'; followersCount?: number; message: string }>(
      'POST',
      '/users/follow',
      payload
    );
  }
  getFollowRequests() {
    return this.get<{ success: boolean; requests: MiniUser[] }>('/users/me/requests');
  }
  respondFollowRequest(followerId: string, action: 'accept' | 'decline') {
    return this.send('POST', `/users/requests/${followerId}/${action}`);
  }
  removeFollower(followerId: string) {
    return this.send('DELETE', `/users/me/followers/${followerId}`);
  }
  block(userId: string) {
    return this.send<{ success: boolean; message: string }>('POST', `/users/${userId}/block`);
  }
  unblock(userId: string) {
    return this.send('DELETE', `/users/${userId}/block`);
  }
  getBlocked() {
    return this.get<{ success: boolean; users: MiniUser[] }>('/users/me/blocked');
  }
  muteCollege(collegeId: string, mute: boolean) {
    return this.send<{ success: boolean; mutedCollegeIds: string[]; message: string }>('POST', '/users/mute-college', { collegeId, mute });
  }
  toggleNotifications(payload: { collegeId?: string; enabled: boolean; isGlobal?: boolean }) {
    return this.send('POST', '/users/notifications/toggle', payload);
  }
  getSaved() {
    return this.get<{ success: boolean; posts: Post[]; reels: Reel[] }>('/users/me/saved');
  }

  // --- Messages ---
  getConversations() {
    return this.get<{ success: boolean; conversations: Conversation[] }>('/messages/conversations');
  }
  openConversation(userId: string) {
    return this.send<{ success: boolean; conversation: Conversation }>('POST', '/messages/conversations', { userId });
  }
  getMessages(conversationId: string, before?: string) {
    return this.get<{ success: boolean; messages: ChatMessage[]; hasMore: boolean; otherLastReadAt: string | null }>(
      `/messages/conversations/${conversationId}/messages${before ? `?before=${encodeURIComponent(before)}` : ''}`
    );
  }
  sendMessage(conversationId: string, text: string, attachment?: { type: MessageAttachment['type']; id: string }) {
    return this.send<{ success: boolean; message: ChatMessage }>('POST', `/messages/conversations/${conversationId}/messages`, { text, attachment });
  }
  sendTo(userIds: string[], text: string, attachment?: { type: MessageAttachment['type']; id: string }) {
    return this.send<{ success: boolean; sent: number }>('POST', '/messages/send', { userIds, text, attachment });
  }
  markConversationRead(conversationId: string) {
    return this.send('POST', `/messages/conversations/${conversationId}/read`);
  }
  unsendMessage(messageId: string) {
    return this.send('DELETE', `/messages/messages/${messageId}`);
  }

  // --- Notifications ---
  getNotifications() {
    return this.get<{ success: boolean; notifications: NotificationItem[]; unreadCount: number; pendingRequests: number }>('/notifications');
  }
  getCounts() {
    return this.get<{ success: boolean; notifications: number; messages: number }>('/notifications/counts');
  }
  markAllNotificationsRead() {
    return this.send('POST', '/notifications/read-all');
  }
  deleteNotification(id: string) {
    return this.send('DELETE', `/notifications/${id}`);
  }

  // --- Live ---
  getLiveSessions() {
    return this.get<{ success: boolean; sessions: LiveSession[] }>('/live');
  }
  getLiveSession(id: string) {
    return this.get<{ success: boolean; session: LiveSession }>(`/live/${id}`);
  }
  getIceConfig() {
    return this.get<{ success: boolean; iceServers: RTCIceServer[]; maxViewers: number }>('/live/ice-config');
  }
  startLive(title: string) {
    return this.send<{ success: boolean; session: LiveSession; iceServers: RTCIceServer[] }>('POST', '/live', { title });
  }
  endLive(id: string) {
    return this.send<{ success: boolean; likes?: number }>('POST', `/live/${id}/end`);
  }

  // --- Reports ---
  getReportReasons() {
    return this.get<{ success: boolean; reasons: string[] }>('/reports/reasons');
  }
  report(payload: { targetType: string; targetId: string; parentId?: string; reason: string; details?: string }) {
    return this.send<{ success: boolean; message: string }>('POST', '/reports', payload);
  }

  // --- Placements ---
  getJobs(opts: { type?: string; search?: string; mine?: boolean } = {}) {
    const p = new URLSearchParams();
    if (opts.type) p.set('type', opts.type);
    if (opts.search) p.set('search', opts.search);
    if (opts.mine) p.set('mine', 'true');
    return this.get<{ success: boolean; count: number; jobs: JobPosting[] }>(`/placements/jobs?${p}`);
  }
  verifyCorporateTaxId(companyName: string, corporateTaxId: string) {
    return this.send<{ success: boolean; validFormat: boolean; message: string }>('POST', '/placements/verify-corporate', { companyName, corporateTaxId });
  }
  postJob(payload: Json) {
    return this.send<{ success: boolean; job: JobPosting }>('POST', '/placements/jobs', payload);
  }
  applyJob(jobId: string) {
    return this.send<{ success: boolean; applied: boolean; applicationCount: number; mailto: string }>('POST', `/placements/jobs/${jobId}/apply`);
  }
  deleteJob(jobId: string) {
    return this.send('DELETE', `/placements/jobs/${jobId}`);
  }

  // --- Support ---
  createTicket(payload: { category: string; subject: string; description: string; priority?: string }) {
    return this.send<{ success: boolean; ticket: SupportTicket }>('POST', '/support/tickets', payload);
  }
  getMyTickets() {
    return this.get<{ success: boolean; tickets: SupportTicket[] }>('/support/tickets');
  }

  // --- Admin (email allow-list + 6-digit PIN) ---
  adminUnlock(pin: string) {
    return this.request('/admin/unlock', { method: 'POST', adminPin: pin });
  }
  adminStats(pin: string) {
    return this.get<{ success: boolean; stats: Record<string, number> }>('/admin/stats', pin);
  }
  adminVerifications(pin: string) {
    return this.get<{ success: boolean; documents: VerificationDocument[] }>('/admin/verifications', pin);
  }
  adminApprove(id: string, pin: string) {
    return this.send<{ success: boolean; message: string }>('POST', `/admin/verifications/${id}/approve`, undefined, pin);
  }
  adminReject(id: string, reason: string, pin: string) {
    return this.send<{ success: boolean; message: string }>('POST', `/admin/verifications/${id}/reject`, { reason }, pin);
  }
  adminReports(pin: string) {
    return this.get<{ success: boolean; reports: Report[] }>('/admin/reports', pin);
  }
  adminReportAction(id: string, action: 'remove' | 'dismiss', pin: string) {
    return this.send('POST', `/admin/reports/${id}/${action}`, undefined, pin);
  }
  adminTickets(pin: string) {
    return this.get<{ success: boolean; tickets: SupportTicket[] }>('/admin/tickets', pin);
  }
  adminUpdateTicket(id: string, payload: { status?: string; adminNote?: string }, pin: string) {
    return this.send('PATCH', `/admin/tickets/${id}`, payload, pin);
  }
  adminAddPinned(collegeId: string, section: string, item: Json, pin: string) {
    return this.send<{ success: boolean; data: PinnedCollegeFeed }>('POST', `/admin/colleges/${collegeId}/pinned`, { section, item }, pin);
  }
  adminRemovePinned(collegeId: string, section: string, itemId: string, pin: string) {
    return this.send<{ success: boolean; data: PinnedCollegeFeed }>('DELETE', `/admin/colleges/${collegeId}/pinned/${section}/${itemId}`, undefined, pin);
  }
  adminChangePin(payload: { oldPin: string; ownerSecret: string; newPin: string; confirmNewPin: string }, pin: string) {
    return this.send<{ success: boolean; message: string }>('POST', '/admin/change-pin', payload, pin);
  }

  // --- Media upload with progress (multipart; local disk or S3) ---
  uploadMedia(
    file: Blob,
    folder: 'posts' | 'reels' | 'stories' | 'avatars' | 'documents',
    onProgress?: (fraction: number) => void,
    fileName = 'upload'
  ): Promise<{ success: boolean; url: string; kind: 'image' | 'video' | 'pdf' }> {
    if (isPreview()) {
      return loadPreview().then(async (preview) => {
        for (const f of [0.35, 0.7, 1]) {
          await new Promise((r) => setTimeout(r, 150));
          onProgress?.(f);
        }
        try {
          return preview.registerUpload(file);
        } catch (err: any) {
          throw new ApiError(err?.message || 'Upload failed.', 400);
        }
      });
    }
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append('folder', folder);
      form.append('file', file, (file as File).name || fileName);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/upload/direct`);
      const token = getToken();
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
      };
      xhr.onload = () => {
        let data: any = null;
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          /* ignore */
        }
        if (xhr.status >= 200 && xhr.status < 300 && data?.url) resolve(data);
        else reject(new ApiError(data?.error || 'Upload failed. Please try again.', xhr.status));
      };
      xhr.onerror = () => reject(new ApiError('Network error during upload.', 0));
      xhr.send(form);
    });
  }
}

export const api = new ApiClient();
