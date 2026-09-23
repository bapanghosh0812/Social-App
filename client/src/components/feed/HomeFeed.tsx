import React, { useEffect, useRef } from 'react';
import { ImagePlus, Clapperboard, Radio, ShieldCheck, ArrowRight, Newspaper, RefreshCw, Clock } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { useFeedStore } from '../../store/useFeedStore.js';
import { useVerificationStore } from '../../store/useVerificationStore.js';
import { useRequireVerified } from '../../lib/actions.js';
import { Avatar } from '../ui/Avatar.js';
import { EmptyState, Segmented, Skeleton } from '../ui/primitives.js';
import { StoriesBar } from './StoriesBar.js';
import { StickyPrimaryCollege } from './StickyPrimaryCollege.js';
import { PostCard } from './PostCard.js';
import { CampusNetworkHub } from '../network/CampusNetworkHub.js';

type HomeMode = 'forYou' | 'following' | 'campus' | 'network';

export const HomeFeed: React.FC = () => {
  const { homeMode, setHomeMode, openPublish, setActiveTab } = useAppStore();
  const { user } = useAuthStore();
  const { posts, isLoading, isRefreshing, hasMore, error, fetchFeed, setMode, patchPost, removePost } = useFeedStore();
  const { openModal: openVerification } = useVerificationStore();
  const requireVerified = useRequireVerified();
  const sentinel = useRef<HTMLDivElement>(null);

  // Infinite scroll.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => entry.isIntersecting && fetchFeed(false), { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [fetchFeed, homeMode]);

  const changeMode = (m: HomeMode) => {
    setHomeMode(m);
    if (m !== 'network') setMode(m);
  };

  const status = user?.verificationStatus;

  return (
    <div className="space-y-4 pb-28">
      <StoriesBar />

      {status !== 'Verified Member' && (
        <button
          onClick={openVerification}
          className="mx-4 flex w-[calc(100%-2rem)] items-center gap-3 rounded-3xl border border-brand/30 bg-brand/[0.08] p-4 text-left transition-colors hover:bg-brand/[0.12]"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-grad text-onbrand">
            {status === 'Pending' ? <Clock className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">
              {status === 'Pending' ? 'Verification in review' : status === 'Rejected' ? 'Verification needs a clearer document' : 'Get your verified badge'}
            </span>
            <span className="block text-xs text-ink2">
              {status === 'Pending'
                ? 'A reviewer is checking your document. You can browse everything meanwhile.'
                : 'Verify your student status to post, comment, go live and more.'}
            </span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-brand" />
        </button>
      )}

      <StickyPrimaryCollege />

      {/* Composer */}
      <div className="card mx-4 p-3">
        <div className="flex items-center gap-3">
          <Avatar src={user?.avatarUrl} name={user?.fullName} size={40} onClick={() => setActiveTab('profile')} />
          <button
            onClick={() => requireVerified(() => openPublish('post'))}
            className="h-11 flex-1 rounded-full border border-line bg-sunken px-4 text-left text-sm text-ink3 transition-colors hover:border-brand/40"
          >
            Share something with campus…
          </button>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1 border-t border-line pt-2">
          {[
            { label: 'Photo', icon: <ImagePlus className="h-[18px] w-[18px] text-success" />, tab: 'post' as const },
            { label: 'Reel', icon: <Clapperboard className="h-[18px] w-[18px] text-[#E0245E]" />, tab: 'reel' as const },
            { label: 'Go live', icon: <Radio className="h-[18px] w-[18px] text-brand" />, tab: 'live' as const },
          ].map((a) => (
            <button
              key={a.label}
              onClick={() => requireVerified(() => openPublish(a.tab))}
              className="flex h-10 items-center justify-center gap-2 rounded-xl text-[13px] font-semibold text-ink2 transition-colors hover:bg-ink/5 hover:text-ink"
            >
              {a.icon} {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="sticky top-14 z-30 -my-1 bg-bg/80 px-4 py-2 backdrop-blur-xl">
        <Segmented
          id="home-mode"
          value={homeMode}
          onChange={changeMode}
          size="sm"
          options={[
            { value: 'forYou', label: 'For you' },
            { value: 'following', label: 'Following' },
            { value: 'campus', label: 'Campus' },
            { value: 'network', label: 'Jobs' },
          ]}
        />
      </div>

      {homeMode === 'network' ? (
        <CampusNetworkHub />
      ) : (
        <div className="space-y-4 px-4">
          {isRefreshing && posts.length === 0 ? (
            <FeedSkeleton />
          ) : posts.length === 0 && !isLoading ? (
            error ? (
              <EmptyState
                icon={<RefreshCw className="h-6 w-6" />}
                title="Couldn't load the feed"
                subtitle={error}
                action={
                  <button onClick={() => fetchFeed(true)} className="chip chip-active">
                    Try again
                  </button>
                }
              />
            ) : (
              <EmptyState
                icon={<Newspaper className="h-6 w-6" />}
                title={homeMode === 'following' ? 'Follow people to fill this feed' : 'Nothing here yet'}
                subtitle={
                  homeMode === 'following'
                    ? 'Posts from people you follow will show up here.'
                    : homeMode === 'campus'
                      ? 'Be the first to post for your campus.'
                      : 'Be the first to share something with campus.'
                }
                action={
                  <button onClick={() => (homeMode === 'following' ? setActiveTab('explore') : requireVerified(() => openPublish('post')))} className="chip chip-active">
                    {homeMode === 'following' ? 'Find people' : 'Create a post'}
                  </button>
                }
              />
            )
          ) : (
            posts.map((p) => (
              <PostCard key={p.id} post={p} onChange={(patch) => patchPost(p.id, patch)} onRemove={() => removePost(p.id)} />
            ))
          )}

          <div ref={sentinel} />
          {isLoading && <FeedSkeleton count={1} />}
          {!hasMore && posts.length > 0 && (
            <p className="py-6 text-center text-xs font-medium uppercase tracking-[0.2em] text-ink3">You're all caught up ✨</p>
          )}
        </div>
      )}
    </div>
  );
};

export const FeedSkeleton: React.FC<{ count?: number }> = ({ count = 2 }) => (
  <>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="card overflow-hidden">
        <div className="flex items-center gap-3 p-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-32 rounded" />
            <Skeleton className="h-2.5 w-24 rounded" />
          </div>
        </div>
        <Skeleton className="aspect-[4/5] w-full" />
        <div className="space-y-2 p-4">
          <Skeleton className="h-3 w-24 rounded" />
          <Skeleton className="h-3 w-3/4 rounded" />
        </div>
      </div>
    ))}
  </>
);
