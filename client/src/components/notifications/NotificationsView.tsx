import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bell, CheckCheck, Heart, MessageCircle, UserPlus, Repeat2, Radio, ShieldCheck, Briefcase, Info, X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore.js';
import { useInboxStore } from '../../store/useInboxStore.js';
import { api, mediaUrl } from '../../services/api.js';
import { realtime } from '../../services/realtime.js';
import { toggleFollowUser } from '../../lib/actions.js';
import type { MiniUser, NotificationItem } from '../../types/index.js';
import { timeAgo } from '../../lib/format.js';
import { Avatar } from '../ui/Avatar.js';
import { Button, EmptyState, IconButton, SectionTitle, Skeleton } from '../ui/primitives.js';
import { FollowPill } from '../profile/UserListSheet.js';

const ICONS: Record<string, { icon: React.ReactNode; cls: string }> = {
  like: { icon: <Heart className="h-3 w-3" fill="currentColor" />, cls: 'bg-[#E0245E]' },
  comment_like: { icon: <Heart className="h-3 w-3" fill="currentColor" />, cls: 'bg-[#E0245E]' },
  comment: { icon: <MessageCircle className="h-3 w-3" fill="currentColor" />, cls: 'bg-info' },
  follow: { icon: <UserPlus className="h-3 w-3" />, cls: 'bg-brand' },
  follow_request: { icon: <UserPlus className="h-3 w-3" />, cls: 'bg-brand' },
  follow_accept: { icon: <UserPlus className="h-3 w-3" />, cls: 'bg-success' },
  repost: { icon: <Repeat2 className="h-3 w-3" />, cls: 'bg-success' },
  live: { icon: <Radio className="h-3 w-3" />, cls: 'bg-[#E0245E]' },
  verification: { icon: <ShieldCheck className="h-3 w-3" />, cls: 'bg-brand' },
  job: { icon: <Briefcase className="h-3 w-3" />, cls: 'bg-info' },
  system: { icon: <Info className="h-3 w-3" />, cls: 'bg-ink3' },
};

export const NotificationsView: React.FC = () => {
  const { goBack, openProfile, openPost, openReels, openLiveViewer, setHomeMode, setActiveTab, addToast } = useAppStore();
  const setUnread = useInboxStore((s) => s.setUnreadNotifications);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [requests, setRequests] = useState<MiniUser[]>([]);
  const [followState, setFollowState] = useState<Record<string, 'none' | 'pending' | 'following'>>({});

  const load = () => {
    api
      .getNotifications()
      .then((r) => {
        setItems(r.notifications);
        if (r.unreadCount) api.markAllNotificationsRead().then(() => setUnread(0)).catch(() => {});
      })
      .catch(() => setItems([]));
    api.getFollowRequests().then((r) => setRequests(r.requests)).catch(() => {});
  };

  useEffect(() => {
    load();
    const off = realtime.on('NOTIFICATION', (m) => {
      setItems((l) => (l ? [m.notification, ...l.filter((x) => x.id !== m.notification.id)] : l));
      if (m.notification.type === 'follow_request') api.getFollowRequests().then((r) => setRequests(r.requests)).catch(() => {});
      api.markAllNotificationsRead().then(() => setUnread(0)).catch(() => {});
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = useMemo(() => {
    const day = 86400_000;
    const now = Date.now();
    const out: { label: string; items: NotificationItem[] }[] = [
      { label: 'Today', items: [] },
      { label: 'This week', items: [] },
      { label: 'Earlier', items: [] },
    ];
    for (const n of items || []) {
      const age = now - new Date(n.createdAt).getTime();
      out[age < day ? 0 : age < 7 * day ? 1 : 2].items.push(n);
    }
    return out.filter((g) => g.items.length);
  }, [items]);

  const respond = async (u: MiniUser, action: 'accept' | 'decline') => {
    try {
      await api.respondFollowRequest(u.id, action);
      setRequests((r) => r.filter((x) => x.id !== u.id));
      addToast(action === 'accept' ? `${u.fullName} can now see your posts` : 'Request removed', 'success');
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  const open = (n: NotificationItem) => {
    if (n.targetType === 'post' && n.targetId) openPost(n.targetId);
    else if (n.targetType === 'reel' && n.targetId) openReels({ startId: n.targetId });
    else if (n.targetType === 'live' && n.targetId) openLiveViewer(n.targetId);
    else if (n.targetType === 'job') {
      setHomeMode('network');
      setActiveTab('home');
    } else if (n.actorId) openProfile(n.actorId);
    else if (n.type === 'verification') setActiveTab('profile');
  };

  const remove = async (id: string) => {
    setItems((l) => l?.filter((x) => x.id !== id) || l);
    api.deleteNotification(id).catch(() => {});
  };

  return (
    <div className="pb-28">
      <div className="glass sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line px-2 safe-top">
        <IconButton label="Back" onClick={goBack}>
          <ArrowLeft className="h-5 w-5" />
        </IconButton>
        <h1 className="flex-1 font-display text-xl font-semibold text-ink">Activity</h1>
        <IconButton
          label="Mark all read"
          onClick={() => {
            api.markAllNotificationsRead().catch(() => {});
            setItems((l) => l?.map((x) => ({ ...x, isRead: true })) || l);
            setUnread(0);
          }}
        >
          <CheckCheck className="h-5 w-5" />
        </IconButton>
      </div>

      <div className="space-y-5 px-4 pt-4">
        {requests.length > 0 && (
          <section className="space-y-2">
            <SectionTitle>Follow requests</SectionTitle>
            <div className="card divide-y divide-line">
              {requests.map((u) => (
                <div key={u.id} className="flex items-center gap-3 p-3">
                  <Avatar src={u.avatarUrl} name={u.fullName} size={44} onClick={() => openProfile(u.id)} />
                  <button onClick={() => openProfile(u.id)} className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-semibold text-ink">{u.fullName}</p>
                    <p className="truncate text-xs text-ink3">{u.collegeName}</p>
                  </button>
                  <Button size="sm" onClick={() => respond(u, 'accept')}>
                    Confirm
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => respond(u, 'decline')}>
                    Delete
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}

        {items === null ? (
          <div className="space-y-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-11 w-11 rounded-full" />
                <Skeleton className="h-3 flex-1 rounded" />
              </div>
            ))}
          </div>
        ) : groups.length === 0 && requests.length === 0 ? (
          <EmptyState icon={<Bell className="h-6 w-6" />} title="No activity yet" subtitle="Likes, comments, new followers and campus updates will show up here." />
        ) : (
          groups.map((g) => (
            <section key={g.label} className="space-y-1">
              <SectionTitle className="pb-1">{g.label}</SectionTitle>
              {g.items.map((n) => {
                const meta = ICONS[n.type] || ICONS.system;
                const fs = n.actorId ? followState[n.actorId] ?? n.actorFollowStatus : undefined;
                return (
                  <div key={n.id} className={`group -mx-2 flex items-center gap-3 rounded-2xl p-2 transition-colors hover:bg-ink/5 ${n.isRead ? '' : 'bg-brand/[0.06]'}`}>
                    <div className="relative shrink-0" onClick={() => (n.actorId ? openProfile(n.actorId) : open(n))}>
                      {n.actor ? (
                        <Avatar src={n.actor.avatarUrl} name={n.actor.fullName} size={46} />
                      ) : (
                        <div className="flex h-[46px] w-[46px] items-center justify-center rounded-full bg-brand-grad font-display font-bold text-onbrand">CC</div>
                      )}
                      <span className={`absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full text-white ring-2 ring-bg ${meta.cls}`}>{meta.icon}</span>
                    </div>
                    <button onClick={() => open(n)} className="min-w-0 flex-1 text-left">
                      <p className="text-[14px] leading-snug text-ink">
                        {n.message} <span className="text-ink3">{timeAgo(n.createdAt)}</span>
                      </p>
                    </button>
                    {n.thumbUrl ? (
                      <button onClick={() => open(n)} className="shrink-0">
                        <img src={mediaUrl(n.thumbUrl)} alt="" className="h-11 w-11 rounded-xl object-cover" />
                      </button>
                    ) : n.type === 'follow' && n.actorId ? (
                      <FollowPill
                        status={fs}
                        onClick={async () => {
                          const next = await toggleFollowUser(n.actorId!, fs, n.actor?.fullName);
                          setFollowState((s) => ({ ...s, [n.actorId!]: next === 'self' ? 'none' : next }));
                        }}
                      />
                    ) : null}
                    <button onClick={() => remove(n.id)} aria-label="Dismiss" className="shrink-0 text-ink3 opacity-0 transition-opacity hover:text-ink group-hover:opacity-100">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </section>
          ))
        )}
      </div>
    </div>
  );
};
