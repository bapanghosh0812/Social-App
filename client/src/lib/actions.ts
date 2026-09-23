import { useCallback } from 'react';
import { useAuthStore } from '../store/useAuthStore.js';
import { useVerificationStore } from '../store/useVerificationStore.js';
import { useAppStore } from '../store/useAppStore.js';
import { api } from '../services/api.js';
import type { FollowStatus } from '../types/index.js';

/** Wrap an action that only verified members may perform (post, comment, reshare, live…). */
export function useRequireVerified() {
  const user = useAuthStore((s) => s.user);
  const openLock = useVerificationStore((s) => s.openPermissionLockModal);
  return useCallback(
    (action: () => void) => {
      if (user?.verificationStatus === 'Verified Member') action();
      else openLock();
    },
    [user?.verificationStatus, openLock]
  );
}

/** Follow / unfollow / cancel request. Returns the new status. */
export async function toggleFollowUser(userId: string, current: FollowStatus | undefined, name?: string): Promise<FollowStatus> {
  const addToast = useAppStore.getState().addToast;
  const follow = current !== 'following' && current !== 'pending';
  try {
    const res = await api.follow({ targetUserId: userId, follow });
    const next: FollowStatus = res.followStatus || (res.isFollowing ? 'following' : 'none');
    const { user, updateLocalUser } = useAuthStore.getState();
    if (user) {
      const delta = (next === 'following' ? 1 : 0) - (current === 'following' ? 1 : 0);
      if (delta) updateLocalUser({ followingCount: Math.max(0, (user.followingCount || 0) + delta) });
    }
    if (next === 'pending') addToast(`Follow request sent${name ? ` to ${name}` : ''}`, 'info');
    return next;
  } catch (err: any) {
    addToast(err.message, 'error');
    return current || 'none';
  }
}
