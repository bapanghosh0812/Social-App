import React, { useEffect, useState } from 'react';
import { Bell, BellOff, CalendarDays, ChevronRight, FileText, Sparkles, Clock, MapPin } from 'lucide-react';
import { useFeedStore } from '../../store/useFeedStore.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { useAppStore } from '../../store/useAppStore.js';
import { api, mediaUrl } from '../../services/api.js';
import { shortCollege } from '../../lib/format.js';

/** Your college's pinned notices, today's events and club highlights. */
export const StickyPrimaryCollege: React.FC = () => {
  const { pinnedFeed, fetchPinnedFeed } = useFeedStore();
  const { user, updateLocalUser } = useAuthStore();
  const { openCollege, addToast } = useAppStore();
  const [alerts, setAlerts] = useState(true);

  useEffect(() => {
    if (!user?.collegeId) return;
    fetchPinnedFeed(user.collegeId);
    setAlerts(user.collegeNotificationsEnabled?.[user.collegeId] !== false);
  }, [user?.collegeId]);

  if (!user?.collegeId) return null;

  const notices = pinnedFeed?.noticeBoard || [];
  const events = pinnedFeed?.todaysPlanning || [];
  const clubs = pinnedFeed?.clubHighlights || [];
  const label = pinnedFeed?.shortCode || shortCollege(pinnedFeed?.collegeName || user.collegeName);
  const empty = !notices.length && !events.length && !clubs.length;

  const toggleAlerts = async () => {
    const next = !alerts;
    setAlerts(next);
    try {
      await api.toggleNotifications({ collegeId: user.collegeId, enabled: next });
      updateLocalUser({ collegeNotificationsEnabled: { ...(user.collegeNotificationsEnabled || {}), [user.collegeId!]: next } });
      addToast(next ? 'Campus alerts on' : 'Campus alerts muted', 'success');
    } catch (err: any) {
      setAlerts(!next);
      addToast(err.message, 'error');
    }
  };

  return (
    <section className="mx-4 overflow-hidden rounded-3xl border border-brand/20 bg-gradient-to-br from-brand/[0.10] via-elev to-elev shadow-card">
      <div className="flex items-center justify-between gap-2 px-4 pt-4">
        <button onClick={() => openCollege(user.collegeId!)} className="flex min-w-0 items-center gap-2.5 text-left">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-grad font-display text-sm font-bold text-onbrand">
            {(pinnedFeed?.shortCode || label).slice(0, 3).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand">Your campus</p>
            <p className="truncate font-display text-[17px] font-semibold text-ink">{label}</p>
          </div>
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleAlerts}
            aria-label={alerts ? 'Mute campus alerts' : 'Turn on campus alerts'}
            className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
              alerts ? 'border-brand/40 bg-brand/10 text-brand' : 'border-line text-ink3'
            }`}
          >
            {alerts ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
          </button>
          <button onClick={() => openCollege(user.collegeId!)} aria-label="Open campus hub" className="flex h-9 w-9 items-center justify-center rounded-full text-ink2 hover:bg-ink/5">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {empty ? (
        <p className="px-4 pb-4 pt-3 text-[13px] leading-relaxed text-ink2">
          Official notices, events and club highlights from {label} will appear here.
        </p>
      ) : (
        <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 pb-4 pt-3">
          {notices.slice(0, 3).map((n) => (
            <a
              key={n.id}
              href={n.attachmentUrl || undefined}
              target={n.attachmentUrl ? '_blank' : undefined}
              rel="noreferrer"
              onClick={(e) => {
                if (!n.attachmentUrl) {
                  e.preventDefault();
                  openCollege(user.collegeId!);
                }
              }}
              className="w-56 shrink-0 rounded-2xl border border-line bg-elev/80 p-3 transition-colors hover:border-brand/40"
            >
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-brand">
                <FileText className="h-3 w-3" /> {n.category}
              </span>
              <p className="mt-1.5 line-clamp-2 text-[13px] font-semibold leading-snug text-ink">{n.title}</p>
              <p className="mt-1 text-[11px] text-ink3">{n.publishedAt}</p>
            </a>
          ))}
          {events.slice(0, 3).map((ev) => (
            <div key={ev.id} className="w-56 shrink-0 rounded-2xl border border-line bg-elev/80 p-3">
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-info">
                <CalendarDays className="h-3 w-3" /> {ev.badge}
              </span>
              <p className="mt-1.5 truncate text-[13px] font-semibold text-ink">{ev.title}</p>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-ink3">
                <span className="flex items-center gap-0.5">
                  <Clock className="h-3 w-3" /> {ev.time}
                </span>
                <span className="flex min-w-0 items-center gap-0.5 truncate">
                  <MapPin className="h-3 w-3 shrink-0" /> {ev.location}
                </span>
              </div>
            </div>
          ))}
          {clubs.slice(0, 2).map((c) => (
            <div key={c.id} className="relative h-[92px] w-44 shrink-0 overflow-hidden rounded-2xl border border-line bg-sunken">
              {c.imageUrl && <img src={mediaUrl(c.imageUrl)} alt="" className="h-full w-full object-cover" loading="lazy" />}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 to-transparent" />
              <div className="absolute inset-x-2.5 bottom-2 text-white">
                <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-brand2">
                  <Sparkles className="h-3 w-3" /> {c.clubName}
                </p>
                <p className="truncate text-[12px] font-semibold">{c.eventTitle}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
