import { create } from 'zustand';
import type { ActiveTab, ReportTarget, ShareTarget, Reel } from '../types/index.js';

export type AppTheme = 'light' | 'dark';
export type ToastKind = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  type: ToastKind;
  message: string;
  action?: { label: string; run: () => void };
}

export type PublishTab = 'post' | 'reel' | 'story' | 'live';

interface ReelsViewerState {
  startId?: string;
  authorId?: string;
  reels?: Reel[];
}

interface AppState {
  theme: AppTheme;
  activeTab: ActiveTab;
  prevTab: ActiveTab;
  profileUserId: string | null;
  collegeId: string | null;
  exploreQuery: string;
  homeMode: 'forYou' | 'following' | 'campus' | 'network';
  reelsMuted: boolean;
  isDeviceFrameEnabled: boolean;

  // Overlays
  publish: { open: boolean; tab: PublishTab };
  comments: { type: 'post' | 'reel'; id: string; ownerId?: string } | null;
  share: ShareTarget | null;
  report: ReportTarget | null;
  postDetailId: string | null;
  reelsViewer: ReelsViewerState | null;
  storyUserId: string | null;
  liveStudioTitle: string | null;
  liveViewerId: string | null;
  followList: { userId: string; list: 'followers' | 'following'; name: string } | null;
  likesList: { type: 'post' | 'reel'; id: string } | null;
  chatWithUserId: string | null;
  isSettingsOpen: boolean;
  settingsView: 'main' | 'editProfile' | 'password' | 'blocked' | 'delete';
  isHelpModalOpen: boolean;
  isLegalOpen: boolean;
  isAdminAuthPromptOpen: boolean;
  isAdminConsoleOpen: boolean;
  adminPin: string | null;
  toasts: Toast[];

  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
  setActiveTab: (tab: ActiveTab) => void;
  goBack: () => void;
  openProfile: (userId: string) => void;
  openCollege: (collegeId: string) => void;
  closeCollege: () => void;
  searchTag: (tag: string) => void;
  setExploreQuery: (q: string) => void;
  setHomeMode: (m: AppState['homeMode']) => void;
  setReelsMuted: (m: boolean) => void;
  toggleDeviceFrame: () => void;

  openPublish: (tab?: PublishTab) => void;
  closePublish: () => void;
  openComments: (type: 'post' | 'reel', id: string, ownerId?: string) => void;
  closeComments: () => void;
  openShare: (target: ShareTarget) => void;
  closeShare: () => void;
  openReport: (target: ReportTarget) => void;
  closeReport: () => void;
  openPost: (postId: string | null) => void;
  openReels: (state: ReelsViewerState | null) => void;
  openStories: (userId: string | null) => void;
  openLiveStudio: (title: string | null) => void;
  openLiveViewer: (sessionId: string | null) => void;
  openFollowList: (v: AppState['followList']) => void;
  openLikes: (v: AppState['likesList']) => void;
  openChatWith: (userId: string | null) => void;
  setSettingsOpen: (open: boolean, view?: AppState['settingsView']) => void;
  setSettingsView: (view: AppState['settingsView']) => void;
  setHelpModalOpen: (open: boolean) => void;
  setLegalOpen: (open: boolean) => void;
  setIsAdminAuthPromptOpen: (open: boolean) => void;
  setAdminConsoleOpen: (open: boolean) => void;
  setAdminPin: (pin: string | null) => void;

  addToast: (message: string, type?: ToastKind, action?: Toast['action']) => void;
  removeToast: (id: string) => void;
}

const THEME_KEY = 'cc_theme';

const savedTheme = ((): AppTheme => {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
})();

function applyTheme(theme: AppTheme, persist = false) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0B0B0E' : '#FFFFFF');
  if (!persist) return;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
}
applyTheme(savedTheme);

export const useAppStore = create<AppState>((set, get) => ({
  theme: savedTheme,
  activeTab: 'home',
  prevTab: 'home',
  profileUserId: null,
  collegeId: null,
  exploreQuery: '',
  homeMode: 'forYou',
  reelsMuted: true,
  isDeviceFrameEnabled: false,

  publish: { open: false, tab: 'post' },
  comments: null,
  share: null,
  report: null,
  postDetailId: null,
  reelsViewer: null,
  storyUserId: null,
  liveStudioTitle: null,
  liveViewerId: null,
  followList: null,
  likesList: null,
  chatWithUserId: null,
  isSettingsOpen: false,
  settingsView: 'main',
  isHelpModalOpen: false,
  isLegalOpen: false,
  isAdminAuthPromptOpen: false,
  isAdminConsoleOpen: false,
  adminPin: null,
  toasts: [],

  setTheme: (theme) => {
    applyTheme(theme, true);
    set({ theme });
  },
  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),

  setActiveTab: (tab) => {
    const { activeTab } = get();
    set({
      activeTab: tab,
      prevTab: activeTab === tab ? get().prevTab : activeTab,
      profileUserId: tab === 'profile' ? null : get().profileUserId,
      collegeId: tab === 'explore' && activeTab === 'explore' ? null : get().collegeId,
      chatWithUserId: tab === 'messages' ? get().chatWithUserId : null,
    });
    window.scrollTo({ top: 0 });
  },

  goBack: () => {
    const { prevTab, activeTab } = get();
    set({ activeTab: prevTab === activeTab ? 'home' : prevTab, profileUserId: null });
  },

  openProfile: (userId) =>
    set((s) => ({
      profileUserId: userId,
      activeTab: 'profile',
      prevTab: s.activeTab === 'profile' ? s.prevTab : s.activeTab,
      comments: null,
      share: null,
      likesList: null,
      followList: null,
      postDetailId: null,
      reelsViewer: null,
      storyUserId: null,
    })),

  openCollege: (collegeId) =>
    set((s) => ({
      collegeId,
      activeTab: 'explore',
      prevTab: s.activeTab === 'explore' ? s.prevTab : s.activeTab,
      postDetailId: null,
      reelsViewer: null,
    })),
  closeCollege: () => set({ collegeId: null }),
  searchTag: (tag) =>
    set((s) => ({
      exploreQuery: `#${tag.replace(/^#/, '')}`,
      activeTab: 'explore',
      collegeId: null,
      prevTab: s.activeTab,
      postDetailId: null,
      comments: null,
      reelsViewer: null,
    })),
  setExploreQuery: (q) => set({ exploreQuery: q }),
  setHomeMode: (m) => set({ homeMode: m }),
  setReelsMuted: (m) => set({ reelsMuted: m }),
  toggleDeviceFrame: () => set((s) => ({ isDeviceFrameEnabled: !s.isDeviceFrameEnabled })),

  openPublish: (tab = 'post') => set({ publish: { open: true, tab } }),
  closePublish: () => set((s) => ({ publish: { ...s.publish, open: false } })),
  openComments: (type, id, ownerId) => set({ comments: { type, id, ownerId } }),
  closeComments: () => set({ comments: null }),
  openShare: (target) => set({ share: target }),
  closeShare: () => set({ share: null }),
  openReport: (target) => set({ report: target }),
  closeReport: () => set({ report: null }),
  openPost: (postId) => set({ postDetailId: postId }),
  openReels: (state) => set({ reelsViewer: state }),
  openStories: (userId) => set({ storyUserId: userId }),
  openLiveStudio: (title) => set({ liveStudioTitle: title, publish: { open: false, tab: 'post' } }),
  openLiveViewer: (sessionId) => set({ liveViewerId: sessionId }),
  openFollowList: (v) => set({ followList: v }),
  openLikes: (v) => set({ likesList: v }),
  openChatWith: (userId) =>
    set((s) => ({
      chatWithUserId: userId,
      activeTab: userId ? 'messages' : s.activeTab,
      prevTab: userId && s.activeTab !== 'messages' ? s.activeTab : s.prevTab,
      share: null,
      storyUserId: null,
      reelsViewer: null,
      postDetailId: null,
    })),
  setSettingsOpen: (open, view = 'main') => set({ isSettingsOpen: open, settingsView: view }),
  setSettingsView: (view) => set({ settingsView: view }),
  setHelpModalOpen: (open) => set({ isHelpModalOpen: open }),
  setLegalOpen: (open) => set({ isLegalOpen: open }),
  setIsAdminAuthPromptOpen: (open) => set({ isAdminAuthPromptOpen: open }),
  setAdminConsoleOpen: (open) => set({ isAdminConsoleOpen: open }),
  setAdminPin: (pin) => set({ adminPin: pin }),

  addToast: (message, type = 'info', action) => {
    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, type, message, action }] }));
    setTimeout(() => get().removeToast(id), action ? 5000 : 3200);
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
