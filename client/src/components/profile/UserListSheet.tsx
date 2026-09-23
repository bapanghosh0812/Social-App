import React, { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { api } from '../../services/api.js';
import { toggleFollowUser } from '../../lib/actions.js';
import type { FollowStatus, MiniUser } from '../../types/index.js';
import { Sheet } from '../ui/Sheet.js';
import { Avatar } from '../ui/Avatar.js';
import { EmptyState, Spinner } from '../ui/primitives.js';
import { VerifiedBadge } from '../ui/misc.js';

/** Followers / following / likes lists with inline follow buttons. */
export const UserListSheet: React.FC = () => {
  const { followList, likesList, openFollowList, openLikes, openProfile, addToast } = useAppStore();
  const me = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<MiniUser[] | null>(null);
  const open = Boolean(followList || likesList);

  useEffect(() => {
    if (!open) return;
    setUsers(null);
    const req = followList
      ? api.getFollowList(followList.userId, followList.list)
      : likesList!.type === 'post'
        ? api.getPostLikes(likesList!.id)
        : api.getReelLikes(likesList!.id);
    req.then((r) => setUsers(r.users)).catch((e) => {
      addToast(e.message, 'error');
      setUsers([]);
    });
  }, [followList?.userId, followList?.list, likesList?.id]);

  const close = () => {
    openFollowList(null);
    openLikes(null);
  };

  const title = followList ? (followList.list === 'followers' ? 'Followers' : 'Following') : 'Likes';

  const follow = async (u: MiniUser) => {
    const next = await toggleFollowUser(u.id, u.followStatus, u.fullName);
    setUsers((list) => list?.map((x) => (x.id === u.id ? { ...x, followStatus: next } : x)) || null);
  };

  const removeFollower = async (u: MiniUser) => {
    try {
      await api.removeFollower(u.id);
      setUsers((list) => list?.filter((x) => x.id !== u.id) || null);
      addToast(`Removed ${u.fullName} from your followers`, 'success');
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  const isMyFollowers = followList?.list === 'followers' && followList.userId === me?.id;

  return (
    <Sheet open={open} onClose={close} title={title} subtitle={followList?.name} height="tall" zIndex={68}>
      <div className="space-y-1 p-3 pb-6">
        {users === null ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : users.length === 0 ? (
          <EmptyState compact icon={<Users className="h-6 w-6" />} title="Nobody here yet" />
        ) : (
          users.map((u) => (
            <div key={u.id} className="flex items-center gap-3 rounded-2xl p-2 hover:bg-ink/5">
              <Avatar src={u.avatarUrl} name={u.fullName} size={48} onClick={() => openProfile(u.id)} />
              <button onClick={() => openProfile(u.id)} className="min-w-0 flex-1 text-left">
                <span className="flex items-center gap-1">
                  <span className="truncate text-sm font-semibold text-ink">{u.fullName}</span>
                  <VerifiedBadge status={u.verificationStatus} size={13} />
                </span>
                <span className="block truncate text-xs text-ink3">{u.headline || u.collegeName || u.companyName}</span>
              </button>
              {isMyFollowers ? (
                <button onClick={() => removeFollower(u)} className="h-8 rounded-xl border border-line px-3 text-xs font-semibold text-ink2 hover:text-danger">
                  Remove
                </button>
              ) : (
                u.id !== me?.id && <FollowPill status={u.followStatus} onClick={() => follow(u)} />
              )}
            </div>
          ))
        )}
      </div>
    </Sheet>
  );
};

export const FollowPill: React.FC<{ status?: FollowStatus; onClick: () => void; size?: 'sm' | 'md' }> = ({ status, onClick, size = 'sm' }) => {
  const following = status === 'following';
  const pending = status === 'pending';
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-xl font-semibold transition-all ${size === 'sm' ? 'h-8 px-3.5 text-xs' : 'h-10 px-5 text-sm'} ${
        following || pending ? 'border border-line bg-elev2 text-ink2 hover:border-line2' : 'bg-brand-grad text-onbrand shadow-brand'
      }`}
    >
      {following ? 'Following' : pending ? 'Requested' : 'Follow'}
    </button>
  );
};
