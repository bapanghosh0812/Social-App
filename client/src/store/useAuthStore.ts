import { create } from 'zustand';
import type { User, Gender } from '../types/index.js';
import { api, setToken, clearToken, getToken, setUnauthorizedHandler, isPreview, startPreview, stopPreview, type AuthConfig, type AuthResult } from '../services/api.js';
import { realtime } from '../services/realtime.js';

const TERMS_KEY = 'cc_terms_accepted';

const safeGet = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const safeSet = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};

interface AuthState {
  user: User | null;
  config: AuthConfig | null;
  /** True when the API could not be reached at startup. */
  serverDown: boolean;
  isLoading: boolean;
  isTermsAccepted: boolean;
  isOnboardingOpen: boolean;

  bootstrap: () => Promise<void>;
  fetchCurrentUser: () => Promise<void>;
  acceptTerms: () => void;
  register: (payload: { fullName: string; email: string; password: string }) => Promise<void>;
  login: (payload: { email: string; password: string }) => Promise<void>;
  loginDemo: () => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  applySession: (res: AuthResult) => void;
  completeOnboarding: (data: {
    role?: 'student' | 'faculty';
    department?: string;
    headline?: string;
    fullName?: string;
    gender?: Gender;
    phoneNumber?: string;
    collegeId?: string;
    academicYear?: string;
    companyName?: string;
    corporateEmail?: string;
    corporateTaxId?: string;
    designation?: string;
  }) => Promise<void>;
  logout: () => void;
  updateLocalUser: (updates: Partial<User>) => void;
}

const OFFLINE_CONFIG: AuthConfig = { demoMode: false, googleClientId: null, passwordReset: true, emailDelivery: false, adminConsole: false };

function loadConfig(set: (s: Partial<AuthState>) => void) {
  api
    .authConfig()
    .then((c) => set({ config: c, serverDown: false }))
    .catch(() => set({ config: OFFLINE_CONFIG, serverDown: true }));
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  config: null,
  serverDown: false,
  isLoading: true,
  isTermsAccepted: safeGet(TERMS_KEY) === 'true',
  isOnboardingOpen: false,

  bootstrap: async () => {
    setUnauthorizedHandler(() => {
      if (get().user) get().logout();
    });
    loadConfig(set);
    await get().fetchCurrentUser();
  },

  fetchCurrentUser: async () => {
    if (!getToken()) {
      set({ user: null, isLoading: false });
      return;
    }
    try {
      const res = await api.getCurrentUser();
      set({ user: res.user, isLoading: false, isOnboardingOpen: !res.user.isProfileComplete });
      realtime.connect();
    } catch (err: any) {
      // Keep the session on transient network errors; drop it on auth failure.
      if (err?.status === 401) clearToken();
      set({ user: null, isLoading: false });
    }
  },

  acceptTerms: () => {
    safeSet(TERMS_KEY, 'true');
    set({ isTermsAccepted: true });
  },

  applySession: (res) => {
    setToken(res.token);
    set({ user: res.user, isLoading: false, isOnboardingOpen: res.requiresOnboarding });
    realtime.disconnect();
    realtime.connect();
  },

  register: async (payload) => {
    const res = await api.register(payload);
    get().applySession(res);
  },
  login: async (payload) => {
    const res = await api.login(payload);
    get().applySession(res);
  },
  loginDemo: async () => {
    // No server connected (e.g. a web-only deploy): run the demo in the browser.
    const res = get().serverDown ? await startPreview() : await api.demoLogin();
    get().acceptTerms();
    get().applySession(res);
  },
  loginWithGoogle: async (credential) => {
    const res = await api.googleLogin(credential);
    get().applySession(res);
  },

  completeOnboarding: async (formData) => {
    const res = await api.submitOnboarding(formData);
    if (res.success && res.user) set({ user: res.user, isOnboardingOpen: false });
  },

  logout: () => {
    api.logout();
    realtime.disconnect();
    clearToken();
    set({ user: null, isOnboardingOpen: false });
    if (isPreview()) {
      stopPreview();
      loadConfig(set);
    }
  },

  updateLocalUser: (updates) => {
    const { user } = get();
    if (user) set({ user: { ...user, ...updates } });
  },
}));
