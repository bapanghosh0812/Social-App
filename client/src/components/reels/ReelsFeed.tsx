import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, ChevronLeft, Clapperboard } from 'lucide-react';
import type { Reel } from '../../types/index.js';
import { useAppStore } from '../../store/useAppStore.js';
import { api } from '../../services/api.js';
import { useRequireVerified } from '../../lib/actions.js';
import { EmptyState, Spinner } from '../ui/primitives.js';
import { ReelItem } from './ReelItem.js';

interface ReelsFeedProps {
  startId?: string;
  authorId?: string;
  initialReels?: Reel[];
  onClose?: () => void;
}

/** Vertical, snap-scrolling reels player. Used as the Reels tab and as an overlay. */
export const ReelsFeed: React.FC<ReelsFeedProps> = ({ startId, authorId, initialReels, onClose }) => {
  const { reelsMuted, setReelsMuted, openPublish } = useAppStore();
  // Pause the tab feed while a full-screen overlay is on top of it.
  const covered = useAppStore(
    (s) => !onClose && Boolean(s.reelsViewer || s.storyUserId || s.liveViewerId || s.liveStudioTitle || s.publish.open)
  );
  const requireVerified = useRequireVerified();
  const [reels, setReels] = useState<Reel[]>(initialReels || []);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialReels);
  const [active, setActive] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const loadingMore = useRef(false);

  const load = useCallback(
    async (more = false) => {
      if (initialReels) return;
      if (more && (!cursor || loadingMore.current)) return;
      loadingMore.current = true;
      try {
        const res = await api.getReels({ cursor: more ? cursor || undefined : undefined, startId: more ? undefined : startId, authorId });
        setReels((prev) => (more ? [...prev, ...res.reels.filter((r) => !prev.some((p) => p.id === r.id))] : res.reels));
        setCursor(res.nextCursor);
      } catch {
        /* keep what we have */
      } finally {
        loadingMore.current = false;
        setLoading(false);
      }
    },
    [cursor, startId, authorId, initialReels]
  );

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startId, authorId]);

  // Scroll an explicitly requested reel into view when using a provided list.
  useEffect(() => {
    if (!initialReels || !startId) return;
    const idx = initialReels.findIndex((r) => r.id === startId);
    if (idx > 0) requestAnimationFrame(() => itemRefs.current[idx]?.scrollIntoView());
  }, [initialReels, startId]);

  // Track which reel is on screen.
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.6) {
            const idx = Number((e.target as HTMLElement).dataset.index);
            setActive(idx);
          }
        }
      },
      { root, threshold: [0.6] }
    );
    itemRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [reels.length]);

  useEffect(() => {
    if (active >= reels.length - 3) load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reels.length]);

  // Keyboard navigation on desktop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowDown' || e.key === 'j') itemRefs.current[Math.min(reels.length - 1, active + 1)]?.scrollIntoView({ behavior: 'smooth' });
      if (e.key === 'ArrowUp' || e.key === 'k') itemRefs.current[Math.max(0, active - 1)]?.scrollIntoView({ behavior: 'smooth' });
      if (e.key === 'm') setReelsMuted(!reelsMuted);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, reels.length, reelsMuted, setReelsMuted]);

  // Keep comment/reshare counts in sync with sheets.
  useEffect(() => {
    const onComments = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d.type === 'reel') setReels((list) => list.map((r) => (r.id === d.id ? { ...r, commentsCount: d.count } : r)));
    };
    const onRepost = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d.type === 'reel') setReels((list) => list.map((r) => (r.id === d.id ? { ...r, repostsCount: d.count } : r)));
    };
    window.addEventListener('cc:comments', onComments);
    window.addEventListener('cc:reposted', onRepost);
    return () => {
      window.removeEventListener('cc:comments', onComments);
      window.removeEventListener('cc:reposted', onRepost);
    };
  }, []);

  // A reel you just published shows up at the top.
  useEffect(() => {
    if (initialReels) return;
    const onCreated = () => {
      load(false);
      scroller.current?.scrollTo({ top: 0 });
    };
    window.addEventListener('cc:reel-created', onCreated);
    return () => window.removeEventListener('cc:reel-created', onCreated);
  }, [load, initialReels]);

  const update = (id: string, patch: Partial<Reel>) => setReels((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id: string) => setReels((list) => list.filter((r) => r.id !== id));

  return (
    <div className="relative h-[var(--app-h)] w-full bg-black">
      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-3 pt-3 text-white safe-top">
        {onClose ? (
          <button onClick={onClose} aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 backdrop-blur-md">
            <ChevronLeft className="h-6 w-6" />
          </button>
        ) : (
          <h1 className="px-1 font-display text-2xl font-semibold drop-shadow">Reels</h1>
        )}
        <button
          onClick={() => requireVerified(() => openPublish('reel'))}
          aria-label="Create a reel"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 backdrop-blur-md"
        >
          <Camera className="h-5 w-5" />
        </button>
      </div>

      {loading ? (
        <div className="flex h-full items-center justify-center">
          <Spinner size={30} />
        </div>
      ) : reels.length === 0 ? (
        <div className="flex h-full items-center justify-center text-white">
          <EmptyState
            icon={<Clapperboard className="h-6 w-6" />}
            title="No reels yet"
            subtitle="Upload a video or paste a YouTube, Instagram or TikTok link to post the first reel."
            action={
              <button onClick={() => requireVerified(() => openPublish('reel'))} className="chip chip-active">
                Create a reel
              </button>
            }
          />
        </div>
      ) : (
        <div ref={scroller} className="no-scrollbar h-full snap-y snap-mandatory overflow-y-scroll overscroll-contain">
          {reels.map((reel, i) => (
            <div
              key={reel.id}
              data-index={i}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              className="h-full w-full snap-start snap-always"
            >
              <ReelItem
                reel={reel}
                active={i === active && !covered}
                near={Math.abs(i - active) <= 1}
                muted={reelsMuted}
                onToggleMute={() => setReelsMuted(!reelsMuted)}
                onUpdate={(patch) => update(reel.id, patch)}
                onRemove={() => remove(reel.id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/** Full-screen reels overlay opened from profiles, saved items, links and notifications. */
export const ReelsViewer: React.FC = () => {
  const { reelsViewer, openReels } = useAppStore();
  if (!reelsViewer) return null;
  return (
    <div className="fixed inset-0 z-[72] flex justify-center bg-black">
      <div className="w-full max-w-[480px]">
        <ReelsFeed
          key={`${reelsViewer.startId}-${reelsViewer.authorId}`}
          startId={reelsViewer.startId}
          authorId={reelsViewer.authorId}
          initialReels={reelsViewer.reels}
          onClose={() => openReels(null)}
        />
      </div>
    </div>
  );
};
