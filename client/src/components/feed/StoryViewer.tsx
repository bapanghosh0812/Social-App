import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Heart, Send, MoreHorizontal, Eye, Trash2, Flag, Clapperboard, Volume2, VolumeX } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { useFeedStore } from '../../store/useFeedStore.js';
import { api, mediaUrl } from '../../services/api.js';
import type { MiniUser } from '../../types/index.js';
import { timeAgo } from '../../lib/format.js';
import { Avatar } from '../ui/Avatar.js';
import { ActionSheet, ConfirmDialog, Sheet } from '../ui/Sheet.js';
import { VerifiedBadge } from '../ui/misc.js';
import { groupStories } from './StoriesBar.js';

const IMAGE_MS = 5500;

export const StoryViewer: React.FC = () => {
  const { storyUserId, openStories, openProfile, openReels, openPost, openReport, addToast } = useAppStore();
  const { user } = useAuthStore();
  const { stories, removeStory, markStorySeen } = useFeedStore();

  const groups = useMemo(() => groupStories(stories, user?.id), [stories, user?.id]);
  const [groupIdx, setGroupIdx] = useState(0);
  const [storyIdx, setStoryIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [reply, setReply] = useState('');
  const [menu, setMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [viewers, setViewers] = useState<{ user: MiniUser; viewedAt: string }[] | null>(null);
  const [hearted, setHearted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const durationRef = useRef(IMAGE_MS);
  const startRef = useRef(0);
  const elapsedRef = useRef(0);
  const holdTimer = useRef<number | undefined>(undefined);

  const close = useCallback(() => openStories(null), [openStories]);

  // Open at the requested person's first unseen story.
  useEffect(() => {
    if (!storyUserId) return;
    const gi = groups.findIndex((g) => g.userId === storyUserId);
    if (gi === -1) {
      close();
      return;
    }
    const g = groups[gi];
    const firstUnseen = g.userId === user?.id ? 0 : Math.max(0, g.stories.findIndex((s) => !s.seenByMe));
    setGroupIdx(gi);
    setStoryIdx(firstUnseen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyUserId]);

  const group = groups[groupIdx];
  const story = group?.stories[storyIdx];
  const isMine = story?.userId === user?.id;

  const next = useCallback(() => {
    if (!group) return;
    if (storyIdx < group.stories.length - 1) setStoryIdx((i) => i + 1);
    else if (groupIdx < groups.length - 1) {
      setGroupIdx((g) => g + 1);
      setStoryIdx(0);
    } else close();
  }, [group, storyIdx, groupIdx, groups.length, close]);

  const nextRef = useRef(next);
  nextRef.current = next;

  const prev = () => {
    if (storyIdx > 0) setStoryIdx((i) => i - 1);
    else if (groupIdx > 0) {
      const pg = groups[groupIdx - 1];
      setGroupIdx((g) => g - 1);
      setStoryIdx(pg.stories.length - 1);
    } else {
      setProgress(0);
      elapsedRef.current = 0;
      startRef.current = performance.now();
    }
  };

  // Reset timing + record the view whenever the story changes.
  useEffect(() => {
    if (!story) return;
    setProgress(0);
    setReply('');
    setHearted(false);
    elapsedRef.current = 0;
    startRef.current = performance.now();
    durationRef.current = IMAGE_MS;
    if (!isMine && !story.seenByMe) {
      markStorySeen(story.id);
      api.viewStory(story.id).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id]);

  const holding = paused || menu || confirmDelete || viewers !== null || reply.length > 0;

  // Progress ticker (images use a timer; videos follow playback time).
  useEffect(() => {
    if (!story || !storyUserId) return;
    let raf = 0;
    const tick = () => {
      if (story.mediaType === 'video') {
        const v = videoRef.current;
        if (v && v.duration) setProgress(Math.min(1, v.currentTime / Math.min(v.duration, 60)));
        if (v && v.duration && v.currentTime >= Math.min(v.duration, 60) - 0.05) return nextRef.current();
      } else {
        const elapsed = elapsedRef.current + (holding ? 0 : performance.now() - startRef.current);
        const p = Math.min(1, elapsed / durationRef.current);
        setProgress(p);
        if (p >= 1) return nextRef.current();
      }
      raf = requestAnimationFrame(tick);
    };
    if (holding) {
      elapsedRef.current += performance.now() - startRef.current;
      videoRef.current?.pause();
    } else {
      startRef.current = performance.now();
      videoRef.current?.play().catch(() => {});
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [story?.id, holding, storyUserId]);

  useEffect(() => {
    if (!storyUserId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const sendReply = async (text: string, reaction = false) => {
    if (!story || !text.trim()) return;
    try {
      await api.sendTo([story.userId], text.trim(), { type: 'story', id: story.id });
      if (reaction) setHearted(true);
      else setReply('');
      addToast(reaction ? `Reacted to ${story.userName.split(' ')[0]}'s story` : 'Reply sent', 'success');
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  const deleteStory = async () => {
    if (!story) return;
    await api.deleteStory(story.id);
    removeStory(story.id);
    addToast('Story deleted', 'success');
    if (group && group.stories.length <= 1) close();
    else setStoryIdx((i) => Math.max(0, i - (i === group!.stories.length - 1 ? 1 : 0)));
  };

  const showViewers = async () => {
    if (!story) return;
    try {
      const res = await api.getStoryViewers(story.id);
      setViewers(res.viewers);
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  return (
    <AnimatePresence>
      {storyUserId && group && story && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.22 }}
        >
          <motion.div
            className="relative h-full w-full max-w-[480px] overflow-hidden bg-black sm:h-[92vh] sm:rounded-4xl"
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_, info) => info.offset.y > 120 && close()}
          >
            {/* Media */}
            <div className="absolute inset-0">
              {story.mediaType === 'video' ? (
                <video
                  key={story.id}
                  ref={videoRef}
                  src={mediaUrl(story.mediaUrl)}
                  autoPlay
                  playsInline
                  muted={muted}
                  className="h-full w-full object-cover"
                />
              ) : (
                <img key={story.id} src={mediaUrl(story.mediaUrl)} alt="" className="h-full w-full object-cover" draggable={false} />
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/70" />
            </div>

            {/* Tap zones: hold to pause, tap left/right to navigate */}
            <div className="absolute inset-0 z-10 flex">
              {[prev, next].map((fn, i) => (
                <div
                  key={i}
                  className={i === 0 ? 'w-1/3' : 'w-2/3'}
                  onPointerDown={() => {
                    holdTimer.current = window.setTimeout(() => setPaused(true), 180);
                  }}
                  onPointerUp={() => {
                    window.clearTimeout(holdTimer.current);
                    if (paused) setPaused(false);
                    else fn();
                  }}
                  onPointerLeave={() => {
                    window.clearTimeout(holdTimer.current);
                    if (paused) setPaused(false);
                  }}
                />
              ))}
            </div>

            {/* Header */}
            <div className="absolute inset-x-0 top-0 z-20 space-y-3 px-3 pt-3 safe-top">
              <div className="flex gap-1">
                {group.stories.map((s, i) => (
                  <div key={s.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
                    <div
                      className="h-full rounded-full bg-white"
                      style={{ width: i < storyIdx ? '100%' : i === storyIdx ? `${progress * 100}%` : '0%' }}
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2.5 text-white">
                <Avatar src={group.userAvatar} name={group.userName} size={36} onClick={() => openProfile(group.userId)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => openProfile(group.userId)} className="truncate text-sm font-semibold">
                      {isMine ? 'Your story' : group.userName}
                    </button>
                    <VerifiedBadge status="Verified Member" size={13} />
                    <span className="text-xs text-white/70">{timeAgo(story.createdAt)}</span>
                  </div>
                  {story.ref && (
                    <button
                      onClick={() => (story.ref!.type === 'reel' ? openReels({ startId: story.ref!.id }) : openPost(story.ref!.id))}
                      className="flex items-center gap-1 text-[11px] font-medium text-white/85"
                    >
                      <Clapperboard className="h-3 w-3" /> View {story.ref.type}
                    </button>
                  )}
                </div>
                {story.mediaType === 'video' && (
                  <button onClick={() => setMuted((m) => !m)} className="p-2" aria-label={muted ? 'Unmute' : 'Mute'}>
                    {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                  </button>
                )}
                <button onClick={() => setMenu(true)} className="p-2" aria-label="More">
                  <MoreHorizontal className="h-5 w-5" />
                </button>
                <button onClick={close} className="p-1.5" aria-label="Close">
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>

            {/* Caption */}
            {story.caption && (
              <div className="absolute inset-x-6 bottom-28 z-20 text-center">
                <span className="inline-block rounded-2xl bg-black/45 px-4 py-2 font-display text-lg text-white backdrop-blur-md">{story.caption}</span>
              </div>
            )}

            {/* Footer */}
            <div className="absolute inset-x-0 bottom-0 z-20 px-3 pb-4 safe-bottom">
              {isMine ? (
                <button onClick={showViewers} className="mx-auto flex items-center gap-2 rounded-full bg-black/45 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-md">
                  <Eye className="h-4 w-4" /> Seen by {story.viewsCount ?? 0}
                </button>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendReply(reply);
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder={`Reply to ${group.userName.split(' ')[0]}…`}
                    maxLength={500}
                    className="h-12 flex-1 rounded-full border border-white/40 bg-black/25 px-5 text-sm text-white placeholder:text-white/70 outline-none backdrop-blur-md focus:border-white"
                  />
                  {reply.trim() ? (
                    <button type="submit" className="flex h-12 w-12 items-center justify-center rounded-full bg-gold-grad text-black" aria-label="Send reply">
                      <Send className="h-5 w-5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => sendReply('❤️', true)}
                      className="flex h-12 w-12 items-center justify-center text-white"
                      aria-label="React with a heart"
                    >
                      <Heart className={`h-7 w-7 ${hearted ? 'animate-like fill-[#E0245E] text-[#E0245E]' : ''}`} />
                    </button>
                  )}
                </form>
              )}
            </div>
          </motion.div>

          <ActionSheet
            open={menu}
            onClose={() => setMenu(false)}
            items={
              isMine
                ? [
                    { label: 'Seen by', icon: <Eye className="h-5 w-5" />, onClick: showViewers },
                    { label: 'Delete story', icon: <Trash2 className="h-5 w-5" />, danger: true, onClick: () => setConfirmDelete(true) },
                  ]
                : [
                    { label: 'View profile', onClick: () => openProfile(group.userId) },
                    {
                      label: 'Report story',
                      icon: <Flag className="h-5 w-5" />,
                      danger: true,
                      onClick: () => openReport({ targetType: 'story', targetId: story.id, ownerId: story.userId, ownerName: story.userName }),
                    },
                  ]
            }
          />
          <ConfirmDialog
            open={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            onConfirm={deleteStory}
            title="Delete this story?"
            confirmLabel="Delete"
            danger
          />
          <Sheet open={viewers !== null} onClose={() => setViewers(null)} title="Viewers" zIndex={90}>
            <div className="space-y-1 p-3 safe-bottom">
              {viewers?.length === 0 && <p className="py-8 text-center text-sm text-ink3">No views yet.</p>}
              {viewers?.map((v) => (
                <button key={v.user.id} onClick={() => openProfile(v.user.id)} className="flex w-full items-center gap-3 rounded-2xl p-2 text-left hover:bg-ink/5">
                  <Avatar src={v.user.avatarUrl} name={v.user.fullName} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{v.user.fullName}</p>
                    <p className="truncate text-xs text-ink3">{v.user.collegeName}</p>
                  </div>
                  <span className="text-xs text-ink3">{timeAgo(v.viewedAt)}</span>
                </button>
              ))}
            </div>
          </Sheet>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
