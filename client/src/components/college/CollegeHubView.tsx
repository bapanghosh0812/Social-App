import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, MapPin, Users, Award, Bell, BellRing, BellOff, FileText, CalendarDays, Sparkles, Briefcase, Newspaper, Plus, Trash2, Clock, Globe, VolumeX, Volume2,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { api, mediaUrl } from '../../services/api.js';
import type { College, PinnedCollegeFeed, Post } from '../../types/index.js';
import { compact } from '../../lib/format.js';
import { Avatar } from '../ui/Avatar.js';
import { Button, EmptyState, Spinner, Tabs } from '../ui/primitives.js';
import { ActionSheet, Sheet } from '../ui/Sheet.js';
import { PostCard } from '../feed/PostCard.js';
import { FeedSkeleton } from '../feed/HomeFeed.js';
import { JobsList } from '../network/CampusNetworkHub.js';

type SubTab = 'feed' | 'notices' | 'events' | 'clubs' | 'placements';

export const CollegeHubView: React.FC = () => {
  const { collegeId, closeCollege, addToast, adminPin, setIsAdminAuthPromptOpen, openProfile } = useAppStore();
  const { user, updateLocalUser } = useAuthStore();
  const [college, setCollege] = useState<College | null>(null);
  const [pinned, setPinned] = useState<PinnedCollegeFeed | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [tab, setTab] = useState<SubTab>('feed');
  const [prefSheet, setPrefSheet] = useState(false);
  const [adding, setAdding] = useState<null | 'noticeBoard' | 'todaysPlanning'>(null);

  const following = Boolean(collegeId && user?.collegeNotificationsEnabled && collegeId in user.collegeNotificationsEnabled);
  const alertsOn = Boolean(collegeId && user?.collegeNotificationsEnabled?.[collegeId]);
  const muted = Boolean(collegeId && user?.mutedCollegeIds?.includes(collegeId));
  const isAdmin = Boolean(user?.isAdmin);

  useEffect(() => {
    if (!collegeId) return;
    setCollege(null);
    setPosts(null);
    setTab('feed');
    api.getCollegeHub(collegeId).then((r) => setCollege(r.college)).catch((e) => addToast(e.message, 'error'));
    api.getPinnedPrimaryCollege(collegeId).then((r) => setPinned(r.data)).catch(() => {});
    api.getFeed({ collegeId, limit: 20 }).then((r) => setPosts(r.posts)).catch(() => setPosts([]));
  }, [collegeId]);

  if (!collegeId) return null;

  const setFollow = async (pref: 'all' | 'highlights' | 'muted' | 'unfollow') => {
    try {
      await api.follow({ targetCollegeId: collegeId, follow: pref !== 'unfollow', notificationPreference: pref === 'unfollow' ? undefined : pref });
      const map = { ...(user?.collegeNotificationsEnabled || {}) };
      if (pref === 'unfollow') delete map[collegeId];
      else map[collegeId] = pref !== 'muted';
      updateLocalUser({ collegeNotificationsEnabled: map });
      addToast(pref === 'unfollow' ? 'Unfollowed' : `Following ${college?.shortCode || 'college'}`, 'success');
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  const toggleMute = async () => {
    try {
      const res = await api.muteCollege(collegeId, !muted);
      updateLocalUser({ mutedCollegeIds: res.mutedCollegeIds });
      addToast(res.message, 'success');
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  const removeItem = async (section: string, itemId: string) => {
    if (!adminPin) return setIsAdminAuthPromptOpen(true);
    try {
      const res = await api.adminRemovePinned(collegeId, section, itemId, adminPin);
      setPinned(res.data);
      addToast('Removed', 'success');
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  const startAdd = (section: 'noticeBoard' | 'todaysPlanning') => {
    if (!adminPin) {
      addToast('Unlock the admin console first', 'info');
      return setIsAdminAuthPromptOpen(true);
    }
    setAdding(section);
  };

  const mono = (college?.shortCode || '…').replace(/\s+/g, '').slice(0, 4).toUpperCase();

  return (
    <div className="pb-28">
      {/* Banner */}
      <div className="relative h-44 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#2a2213] via-[#15130f] to-[#0b0b0e]" />
        <div className="absolute -right-16 -top-20 h-72 w-72 rounded-full bg-brand/25 blur-3xl" />
        <div className="absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-brand/10 blur-2xl" />
        <div className="absolute inset-0 opacity-[0.07] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:14px_14px]" />
        <button onClick={closeCollege} aria-label="Back" className="absolute left-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md safe-top">
          <ArrowLeft className="h-5 w-5" />
        </button>
      </div>

      <div className="relative -mt-12 space-y-4 px-4">
        <div className="flex items-end justify-between gap-3">
          <div className="flex h-24 w-24 items-center justify-center rounded-[28%] border-4 border-bg bg-brand-grad font-display text-2xl font-bold text-onbrand shadow-lift">{mono}</div>
          <div className="flex gap-2 pb-1">
            <Button variant={following ? 'secondary' : 'primary'} size="md" onClick={() => setPrefSheet(true)} icon={following ? (alertsOn ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />) : <Plus className="h-4 w-4" />}>
              {following ? 'Following' : 'Follow'}
            </Button>
            {user?.collegeId !== collegeId && (
              <button onClick={toggleMute} aria-label={muted ? 'Unmute college' : 'Mute college'} className="flex h-10 w-10 items-center justify-center rounded-2xl border border-line bg-elev2 text-ink2 hover:text-ink">
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
            )}
          </div>
        </div>

        {!college ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <>
            <div>
              <h1 className="font-display text-[26px] font-semibold leading-tight text-ink">{college.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink2">
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {college.city}, {college.state}
                </span>
                {college.nirfRank ? (
                  <span className="flex items-center gap-1 font-semibold text-brand">
                    <Award className="h-3.5 w-3.5" /> NIRF #{college.nirfRank}
                  </span>
                ) : null}
                {college.establishedYear ? <span>Est. {college.establishedYear}</span> : null}
                {college.website && (
                  <a href={college.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-brand hover:underline">
                    <Globe className="h-3.5 w-3.5" /> Website
                  </a>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Verified members', value: compact(college.verifiedStudentCount) },
                { label: 'Posts', value: compact(college.activePostsCount || 0) },
                { label: 'Type', value: college.type },
              ].map((s) => (
                <div key={s.label} className="card px-3 py-3 text-center">
                  <p className="font-display text-xl font-semibold text-ink">{s.value}</p>
                  <p className="text-[10px] uppercase tracking-wider text-ink3">{s.label}</p>
                </div>
              ))}
            </div>

            {college.verifiedMembersList && college.verifiedMembersList.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex -space-x-2">
                  {college.verifiedMembersList.slice(0, 6).map((m) => (
                    <Avatar key={m.id} src={m.avatar} name={m.name} size={30} className="ring-2 ring-bg rounded-full" onClick={() => openProfile(m.id)} />
                  ))}
                </div>
                <span className="text-xs text-ink2">
                  <Users className="mr-1 inline h-3.5 w-3.5" />
                  Members on College Campus
                </span>
              </div>
            )}
          </>
        )}
      </div>

      <div className="sticky top-0 z-20 mt-4 bg-bg/85 backdrop-blur-xl">
        <Tabs
          id="college-tabs"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'feed', label: 'Feed' },
            { value: 'notices', label: 'Notices' },
            { value: 'events', label: 'Events' },
            { value: 'clubs', label: 'Clubs' },
            { value: 'placements', label: 'Jobs' },
          ]}
        />
      </div>

      <div className="space-y-3 px-4 pt-4">
        {tab === 'feed' &&
          (posts === null ? (
            <FeedSkeleton count={1} />
          ) : posts.length === 0 ? (
            <EmptyState icon={<Newspaper className="h-6 w-6" />} title="No posts yet" subtitle="Posts from verified members of this college appear here." />
          ) : (
            posts.map((p) => <PostCard key={p.id} post={p} onRemove={() => setPosts((l) => l?.filter((x) => x.id !== p.id) || null)} />)
          ))}

        {tab === 'notices' && (
          <>
            {isAdmin && (
              <Button variant="outline" full onClick={() => startAdd('noticeBoard')} icon={<Plus className="h-4 w-4" />}>
                Publish a notice
              </Button>
            )}
            {pinned?.noticeBoard.length ? (
              pinned.noticeBoard.map((n) => (
                <div key={n.id} className="card flex items-start gap-3 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-brand">{n.category}</span>
                    <p className="text-sm font-semibold text-ink">{n.title}</p>
                    <p className="mt-0.5 text-xs text-ink3">{n.publishedAt}</p>
                    {n.attachmentUrl && (
                      <a href={n.attachmentUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-semibold text-brand hover:underline">
                        Open attachment
                      </a>
                    )}
                  </div>
                  {isAdmin && (
                    <button onClick={() => removeItem('noticeBoard', n.id)} aria-label="Remove notice" className="text-ink3 hover:text-danger">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))
            ) : (
              <EmptyState icon={<FileText className="h-6 w-6" />} title="No notices yet" subtitle="Official announcements from this college will appear here." />
            )}
          </>
        )}

        {tab === 'events' && (
          <>
            {isAdmin && (
              <Button variant="outline" full onClick={() => startAdd('todaysPlanning')} icon={<Plus className="h-4 w-4" />}>
                Add an event
              </Button>
            )}
            {pinned?.todaysPlanning.length ? (
              pinned.todaysPlanning.map((ev) => (
                <div key={ev.id} className="card flex items-start gap-3 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-info/10 text-info">
                    <CalendarDays className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-info">{ev.badge}</span>
                    <p className="text-sm font-semibold text-ink">{ev.title}</p>
                    <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink3">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {ev.time}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {ev.location}
                      </span>
                      {ev.organizer && <span>by {ev.organizer}</span>}
                    </p>
                  </div>
                  {isAdmin && (
                    <button onClick={() => removeItem('todaysPlanning', ev.id)} aria-label="Remove event" className="text-ink3 hover:text-danger">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))
            ) : (
              <EmptyState icon={<CalendarDays className="h-6 w-6" />} title="Nothing scheduled" subtitle="Upcoming events and fests will appear here." />
            )}
          </>
        )}

        {tab === 'clubs' &&
          (pinned?.clubHighlights.length ? (
            <div className="grid grid-cols-2 gap-3">
              {pinned.clubHighlights.map((c) => (
                <div key={c.id} className="card overflow-hidden">
                  <div className="aspect-[4/3] bg-sunken">{c.imageUrl && <img src={mediaUrl(c.imageUrl)} alt="" className="h-full w-full object-cover" loading="lazy" />}</div>
                  <div className="p-3">
                    <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-brand">
                      <Sparkles className="h-3 w-3" /> {c.clubName}
                    </p>
                    <p className="truncate text-sm font-semibold text-ink">{c.eventTitle}</p>
                    <p className="text-[11px] text-ink3">{c.timeAgo}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Sparkles className="h-6 w-6" />} title="No club highlights yet" subtitle="Student clubs and societies will show up here." />
          ))}

        {tab === 'placements' && <JobsList />}
      </div>

      <ActionSheet
        open={prefSheet}
        onClose={() => setPrefSheet(false)}
        title="Notifications from this college"
        items={[
          { label: 'All updates', icon: <BellRing className="h-5 w-5" />, hint: 'Posts, notices, events', onClick: () => setFollow('all') },
          { label: 'Highlights only', icon: <Bell className="h-5 w-5" />, hint: 'Notices & big events', onClick: () => setFollow('highlights') },
          { label: 'Follow silently', icon: <BellOff className="h-5 w-5" />, onClick: () => setFollow('muted') },
          ...(following ? [{ label: 'Unfollow', danger: true, onClick: () => setFollow('unfollow') }] : []),
        ]}
      />
      <PinnedItemForm
        section={adding}
        onClose={() => setAdding(null)}
        onSubmit={async (item) => {
          if (!adding || !adminPin) return;
          const res = await api.adminAddPinned(collegeId, adding, item, adminPin);
          setPinned(res.data);
          addToast('Published to the campus hub', 'success');
        }}
      />
    </div>
  );
};

const PinnedItemForm: React.FC<{
  section: null | 'noticeBoard' | 'todaysPlanning';
  onClose: () => void;
  onSubmit: (item: Record<string, string>) => Promise<void>;
}> = ({ section, onClose, onSubmit }) => {
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm(section === 'noticeBoard' ? { category: 'Urgent' } : { badge: 'Event' }), [section]);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Sheet open={Boolean(section)} onClose={onClose} title={section === 'noticeBoard' ? 'New notice' : 'New event'}>
      <form
        className="space-y-3 p-5 safe-bottom"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onSubmit(form);
            onClose();
          } catch (err: any) {
            useAppStore.getState().addToast(err.message, 'error');
          } finally {
            setBusy(false);
          }
        }}
      >
        <input required value={form.title || ''} onChange={set('title')} placeholder="Title" maxLength={160} className="input" />
        {section === 'noticeBoard' ? (
          <>
            <select value={form.category} onChange={set('category')} className="input">
              {['Urgent', 'Exam', 'Fest', 'Holiday', 'Placement'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <input value={form.attachmentUrl || ''} onChange={set('attachmentUrl')} placeholder="Attachment link (https://…, optional)" className="input" />
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <input value={form.time || ''} onChange={set('time')} placeholder="Time (e.g. 5:00 PM)" className="input" />
              <input value={form.badge || ''} onChange={set('badge')} placeholder="Label" className="input" />
            </div>
            <input value={form.location || ''} onChange={set('location')} placeholder="Location" className="input" />
            <input value={form.organizer || ''} onChange={set('organizer')} placeholder="Organiser" className="input" />
          </>
        )}
        <Button type="submit" full size="lg" loading={busy}>
          Publish
        </Button>
      </form>
    </Sheet>
  );
};
