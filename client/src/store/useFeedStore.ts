import { create } from 'zustand';
import type { Post, PinnedCollegeFeed, CampusStory, LiveSession } from '../types/index.js';
import { api } from '../services/api.js';

type FeedMode = 'forYou' | 'following' | 'campus';

interface FeedState {
  mode: FeedMode;
  posts: Post[];
  cursor: string | null;
  hasMore: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  stories: CampusStory[];
  lives: LiveSession[];
  pinnedFeed: PinnedCollegeFeed | null;

  setMode: (mode: FeedMode) => void;
  fetchFeed: (refresh?: boolean) => Promise<void>;
  fetchStories: () => Promise<void>;
  fetchLives: () => Promise<void>;
  fetchPinnedFeed: (collegeId?: string) => Promise<void>;
  patchPost: (postId: string, patch: Partial<Post>) => void;
  removePost: (postId: string) => void;
  prependPost: (post: Post) => void;
  addStory: (story: CampusStory) => void;
  removeStory: (storyId: string) => void;
  markStorySeen: (storyId: string) => void;
}

let feedRequest = 0;

export const useFeedStore = create<FeedState>((set, get) => ({
  mode: 'forYou',
  posts: [],
  cursor: null,
  hasMore: true,
  isLoading: false,
  isRefreshing: false,
  error: null,
  stories: [],
  lives: [],
  pinnedFeed: null,

  setMode: (mode) => {
    if (get().mode === mode) return;
    set({ mode, posts: [], cursor: null, hasMore: true });
    get().fetchFeed(true);
  },

  fetchFeed: async (refresh = false) => {
    const { cursor, isLoading, hasMore, mode } = get();
    if (!refresh && (isLoading || !hasMore)) return;
    const reqId = ++feedRequest;
    set(refresh ? { isRefreshing: true, error: null } : { isLoading: true, error: null });
    try {
      const res = await api.getFeed({ cursor: refresh ? undefined : cursor || undefined, mode });
      if (reqId !== feedRequest) return; // a newer request (e.g. mode switch) superseded this one
      set((s) => ({
        posts: refresh ? res.posts : [...s.posts, ...res.posts.filter((p) => !s.posts.some((x) => x.id === p.id))],
        cursor: res.nextCursor,
        hasMore: res.hasMore,
        isLoading: false,
        isRefreshing: false,
      }));
    } catch (err: any) {
      if (reqId === feedRequest) set({ error: err.message, isLoading: false, isRefreshing: false });
    }
  },

  fetchStories: async () => {
    try {
      const res = await api.getStories();
      set({ stories: res.stories });
    } catch {
      /* non-critical */
    }
  },

  fetchLives: async () => {
    try {
      const res = await api.getLiveSessions();
      set({ lives: res.sessions });
    } catch {
      /* non-critical */
    }
  },

  fetchPinnedFeed: async (collegeId) => {
    try {
      const res = await api.getPinnedPrimaryCollege(collegeId);
      set({ pinnedFeed: res.data });
    } catch {
      /* non-critical */
    }
  },

  patchPost: (postId, patch) =>
    set((s) => ({
      posts: s.posts.map((p) => {
        if (p.id === postId) return { ...p, ...patch };
        if (p.repost && p.repost.id === postId) return { ...p, repost: { ...p.repost, ...patch } as Post };
        return p;
      }),
    })),
  removePost: (postId) => set((s) => ({ posts: s.posts.filter((p) => p.id !== postId && p.repost?.id !== postId) })),
  prependPost: (post) => set((s) => ({ posts: [post, ...s.posts.filter((p) => p.id !== post.id)] })),
  addStory: (story) => set((s) => ({ stories: [...s.stories, story] })),
  removeStory: (storyId) => set((s) => ({ stories: s.stories.filter((x) => x.id !== storyId) })),
  markStorySeen: (storyId) => set((s) => ({ stories: s.stories.map((x) => (x.id === storyId ? { ...x, seenByMe: true } : x)) })),
}));
