import { create } from 'zustand';
import { api } from '../services/api.js';
import { useAuthStore } from './useAuthStore.js';

import type { VerificationDocType as DocType } from '../types/index.js';

interface VerificationState {
  isModalOpen: boolean;
  isPermissionLockModalOpen: boolean;
  isSubmitting: boolean;
  progress: number;
  submitted: boolean;
  selectedDocType: DocType;
  error: string | null;

  openModal: () => void;
  closeModal: () => void;
  openPermissionLockModal: () => void;
  closePermissionLockModal: () => void;
  setSelectedDocType: (type: DocType) => void;
  submitDocument: (file: File) => Promise<void>;
  reset: () => void;
}

export const useVerificationStore = create<VerificationState>((set, get) => ({
  isModalOpen: false,
  isPermissionLockModalOpen: false,
  isSubmitting: false,
  progress: 0,
  submitted: false,
  selectedDocType: 'fees_receipt',
  error: null,

  openModal: () => set({ isModalOpen: true, isPermissionLockModalOpen: false, submitted: false, error: null }),
  closeModal: () => set({ isModalOpen: false, isSubmitting: false }),
  openPermissionLockModal: () => set({ isPermissionLockModalOpen: true }),
  closePermissionLockModal: () => set({ isPermissionLockModalOpen: false }),
  setSelectedDocType: (type) => set({ selectedDocType: type }),

  submitDocument: async (file) => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    set({ isSubmitting: true, error: null, progress: 0 });
    try {
      // 1. Upload to private storage (only reviewers can ever view it).
      const uploaded = await api.uploadMedia(file, 'documents', (p) => set({ progress: p }));
      // 2. Submit for human review.
      await api.uploadAndVerifyDocument({
        documentType: get().selectedDocType,
        documentUrl: uploaded.url,
        academicYear: user.academicYear,
      });
      set({ submitted: true, isSubmitting: false });
      useAuthStore.getState().updateLocalUser({ verificationStatus: 'Pending' });
    } catch (err: any) {
      set({ error: err.message || 'Could not submit your document.', isSubmitting: false });
    }
  },

  reset: () => set({ submitted: false, error: null, isSubmitting: false, progress: 0 }),
}));
