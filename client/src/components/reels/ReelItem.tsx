import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Heart, MessageCircle, Send, Bookmark, MoreVertical, Repeat2, Music2, Play, Plus, Eye, Link2, Flag, Trash2, ExternalLink, EyeOff, Check,
} from 'lucide-react';
import type { Reel } from '../../types/index.js';
import { useAppStore } from '../../store/useAppStore.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { api, mediaUrl } from '../../services/api.js';
import { toggleFollowUser, useRequireVerified } from '../../lib/actions.js';
import { compact, copyText, shareUrl, shortCollege, timeAgo } from '../../lib/format.js';
import { Avatar } from '../ui/Avatar.js';
import { HeartBurst, RichText, VerifiedBadge } from '../ui/misc.js';
import { ActionSheet, ConfirmDialog, type ActionItem } from '../ui/Sheet.js';

const PROVIDER_LABEL: Record<string, string> = {
  youtube: 'YouTube',
  vimeo: 'Vimeo',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  direct: 'Web',
};

interface ReelItemProps {
  reel: Reel;
  active: boolean;
  near: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onUpdate: (patch: Partial<Reel>) => void;
  onRemove: () => void;
}

export const ReelItem: React.FC<ReelItemProps> = ({ reel, active, near, muted, onToggleMute, onUpdate, onRemove }) => {
  const { openProfile, openComments, openShare, openReport, addToast } = useAppStore();
  const me = useAuthStore((s) => s.user);
  const requireVerified = useRequireVerified();

  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const tapTimer = useRef<number | undefined>(undefined);
  const lastTap = useRef(0);
  const viewed = useRef(false);

  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [burst, setBurst] = useState<{ x: number; y: number; k: number } | null>(null);
  const [likeAnim, setLikeAnim] = useState(0);
  const [menu, setMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [followStatus, setFollowStatus] = useState(reel.authorFollowStatus === 'accepted' ? 'following' : reel.authorFollowStatus === 'pending' ? 'pending' : 'none');

  const provider = reel.provider || 'upload';
  const isFile = provider === 'upload' || provider === 'direct';
  const isEmbed = !isFile;
  const interactiveEmbed = provider === 'instagram' || provider === 'tiktok';
  const isOwner = reel.isOwner || reel.authorId === me?.id;
  const ytId = provider === 'youtube' ? reel.videoUrl.split('/embed/')[1]?.split('?')[0] : '';

  // Play/pause the active reel; restart when it becomes active again.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (active && !paused) {
      v.play().catch(() => {
        // Autoplay with sound can be blocked; retry muted.
        if (!v.muted) {
          v.muted = true;
          v.play().catch(() => {});
        }
      });
    } else v.pause();
  }, [active, paused]);

  useEffect(() => {
    if (active) {
      setPaused(false);
      const v = videoRef.current;
      if (v) v.currentTime = 0;
    }
  }, [active]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
    postToEmbed(muted ? 'mute' : 'unmute');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muted]);

  // Count a view after the reel has been on screen for a moment.
  useEffect(() => {
    if (!active || viewed.current) return;
    const t = setTimeout(() => {
      viewed.current = true;
      api
        .viewReel(reel.id)
        .then((r) => onUpdate({ viewsCount: r.viewsCount }))
        .catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reel.id]);

  const postToEmbed = (cmd: 'play' | 'pause' | 'mute' | 'unmute') => {
    const win = frameRef.current?.contentWindow;
    if (!win) return;
    if (provider === 'youtube') {
      const func = { play: 'playVideo', pause: 'pauseVideo', mute: 'mute', unmute: 'unMute' }[cmd];
      win.postMessage(JSON.stringify({ event: 'command', func, args: [] }), 'https://www.youtube-nocookie.com');
    } else if (provider === 'vimeo') {
      const msg = cmd === 'play' ? { method: 'play' } : cmd === 'pause' ? { method: 'pause' } : { method: 'setMuted', value: cmd === 'mute' };
      win.postMessage(JSON.stringify(msg), 'https://player.vimeo.com');
    }
  };

  const like = async (fromDoubleTap = false) => {
    if (fromDoubleTap && reel.isLikedByMe) return;
    const next = !reel.isLikedByMe;
    onUpdate({ isLikedByMe: next, likesCount: reel.likesCount + (next ? 1 : -1) });
    if (next) setLikeAnim((k) => k + 1);
    try {
      const res = await api.toggleLikeReel(reel.id);
      onUpdate({ isLikedByMe: res.isLikedByMe, likesCount: res.likesCount });
    } catch (err: any) {
      onUpdate({ isLikedByMe: !next, likesCount: reel.likesCount });
      addToast(err.message, 'error');
    }
  };

  const onTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const now = Date.now();
    if (now - lastTap.current < 280) {
      window.clearTimeout(tapTimer.current);
      lastTap.current = 0;
      setBurst({ x, y, k: now });
      setTimeout(() => setBurst(null), 950);
      like(true);
      return;
    }
    lastTap.current = now;
    tapTimer.current = window.setTimeout(() => {
      setPaused((p) => {
        postToEmbed(p ? 'play' : 'pause');
        return !p;
      });
    }, 260);
  };

  const save = async () => {
    const next = !reel.isSavedByMe;
    onUpdate({ isSavedByMe: next });
    try {
      const res = await api.toggleSaveReel(reel.id);
      onUpdate({ isSavedByMe: res.isSaved });
      addToast(res.isSaved ? 'Saved to your collection' : 'Removed from saved', 'success');
    } catch (err: any) {
      onUpdate({ isSavedByMe: !next });
      addToast(err.message, 'error');
    }
  };

  const repost = () =>
    requireVerified(async () => {
      try {
        const res = await api.repostReel(reel.id);
        onUpdate({ repostsCount: res.repostsCount });
        addToast(res.reposted ? 'Reshared to your feed' : 'Reshare removed', 'success');
      } catch (err: any) {
        addToast(err.message, 'error');
      }
    });

  const follow = async () => {
    const next = await toggleFollowUser(reel.authorId, followStatus as any, reel.authorName);
    setFollowStatus(next);
    if (next === 'following') addToast(`Following ${reel.authorName.split(' ')[0]}`, 'success');
  };

  const share = () =>
    openShare({ type: 'reel', id: reel.id, title: reel.caption, authorName: reel.authorName, thumbUrl: reel.thumbnailUrl, canRepost: !isOwner });

  const menuItems: ActionItem[] = [
    { label: 'Copy link', icon: <Link2 className="h-5 w-5" />, onClick: async () => addToast((await copyText(shareUrl('reel', reel.id))) ? 'Link copied' : 'Could not copy', 'success') },
    ...(reel.sourceUrl ? [{ label: `Open on ${PROVIDER_LABEL[provider] || 'source'}`, icon: <ExternalLink className="h-5 w-5" />, onClick: () => window.open(reel.sourceUrl, '_blank', 'noopener,noreferrer') }] : []),
    ...(isOwner
      ? [{ label: 'Delete reel', icon: <Trash2 className="h-5 w-5" />, danger: true, onClick: () => setConfirmDelete(true) }]
      : [
          { label: 'Not interested', icon: <EyeOff className="h-5 w-5" />, onClick: () => { onRemove(); addToast("We'll show fewer reels like this", 'info'); } },
          { label: 'Report', icon: <Flag className="h-5 w-5" />, danger: true, onClick: () => openReport({ targetType: 'reel', targetId: reel.id, ownerId: reel.authorId, ownerName: reel.authorName }) },
        ]),
  ];

  const embedSrc = (() => {
    if (provider === 'youtube')
      return `${reel.videoUrl}?autoplay=1&mute=${muted ? 1 : 0}&controls=0&loop=1&playlist=${ytId}&playsinline=1&modestbranding=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`;
    if (provider === 'vimeo') return `${reel.videoUrl}?autoplay=1&muted=${muted ? 1 : 0}&loop=1&controls=0&title=0&byline=0&portrait=0`;
    return reel.videoUrl;
  })();

  return (
    <div className="relative h-full w-full snap-start snap-always overflow-hidden bg-black">
      {/* Player */}
      <div className="absolute inset-0 flex items-center justify-center">
        {isFile ? (
          <video
            ref={videoRef}
            src={near ? mediaUrl(reel.videoUrl) : undefined}
            poster={reel.thumbnailUrl ? mediaUrl(reel.thumbnailUrl) : undefined}
            loop
            playsInline
            muted={muted}
            preload={active ? 'auto' : near ? 'metadata' : 'none'}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              if (v.duration) setProgress(v.currentTime / v.duration);
            }}
            className="h-full w-full object-cover"
          />
        ) : active ? (
          <iframe
            ref={frameRef}
            src={embedSrc}
            title={reel.caption || 'Reel'}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
            className="h-full w-full border-0"
          />
        ) : reel.thumbnailUrl ? (
          <img src={mediaUrl(reel.thumbnailUrl)} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-[#1b1b22] to-black" />
        )}
      </div>

      {/* Tap layer (embeds from Instagram/TikTok keep their own controls) */}
      {!interactiveEmbed && <div className="absolute inset-0 z-10" onClick={onTap} />}
      {burst && <HeartBurst key={burst.k} show x={burst.x} y={burst.y} size={110} />}

      {paused && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex h-20 w-20 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md">
            <Play className="ml-1 h-9 w-9" fill="currentColor" />
          </motion.span>
        </div>
      )}

      {/* Shade for legibility */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[55%] bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-28 bg-gradient-to-b from-black/50 to-transparent" />

      {/* Right action rail */}
      <div className="absolute bottom-28 right-2 z-20 flex flex-col items-center gap-4 text-white">
        <div className="relative mb-1">
          <Avatar src={reel.authorAvatar} name={reel.authorName} size={46} ring="gold" onClick={() => openProfile(reel.authorId)} />
          {!isOwner && followStatus === 'none' && (
            <button
              onClick={follow}
              aria-label={`Follow ${reel.authorName}`}
              className="absolute -bottom-2 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full bg-gold-grad text-black ring-2 ring-black"
            >
              <Plus className="h-3 w-3" strokeWidth={3.5} />
            </button>
          )}
          {!isOwner && followStatus !== 'none' && (
            <span className="absolute -bottom-2 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full bg-white text-black ring-2 ring-black">
              <Check className="h-3 w-3" strokeWidth={3.5} />
            </span>
          )}
        </div>
        <RailButton label="Like" count={reel.likesCount} onClick={() => like()}>
          <Heart key={likeAnim} className={`h-[30px] w-[30px] drop-shadow ${reel.isLikedByMe ? 'animate-like fill-[#FF3B5C] text-[#FF3B5C]' : ''}`} />
        </RailButton>
        <RailButton label="Comments" count={reel.commentsCount} onClick={() => openComments('reel', reel.id, reel.authorId)}>
          <MessageCircle className="h-[28px] w-[28px] drop-shadow" />
        </RailButton>
        <RailButton label="Share" count={reel.sharesCount} onClick={share}>
          <Send className="h-[27px] w-[27px] -rotate-12 drop-shadow" />
        </RailButton>
        {!isOwner && (
          <RailButton label="Reshare" count={reel.repostsCount || 0} onClick={repost}>
            <Repeat2 className="h-[28px] w-[28px] drop-shadow" />
          </RailButton>
        )}
        <RailButton label={reel.isSavedByMe ? 'Saved' : 'Save'} onClick={save}>
          <Bookmark className={`h-[27px] w-[27px] drop-shadow ${reel.isSavedByMe ? 'fill-gold text-gold' : ''}`} />
        </RailButton>
        <RailButton label="More" onClick={() => setMenu(true)}>
          <MoreVertical className="h-[24px] w-[24px] drop-shadow" />
        </RailButton>
        <div className="mt-1 h-9 w-9 animate-spin-slow overflow-hidden rounded-xl border-2 border-white/70 bg-black">
          <Avatar src={reel.authorAvatar} name={reel.authorName} size={32} square />
        </div>
      </div>

      {/* Caption block */}
      <div className="absolute bottom-24 left-0 right-16 z-20 space-y-2.5 px-4 text-white">
        <div className="flex items-center gap-2">
          <button onClick={() => openProfile(reel.authorId)} className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[15px] font-semibold drop-shadow">{reel.authorName}</span>
            <VerifiedBadge status={reel.authorVerificationStatus} size={15} />
          </button>
          {!isOwner && followStatus === 'none' && (
            <button onClick={follow} className="h-7 shrink-0 rounded-lg border border-white/70 px-3 text-xs font-semibold backdrop-blur-sm hover:bg-white/15">
              Follow
            </button>
          )}
        </div>
        {reel.authorCollege && <p className="-mt-1.5 truncate text-xs text-white/75">{shortCollege(reel.authorCollege)} · {timeAgo(reel.createdAt)}</p>}
        {reel.caption && <RichText text={reel.caption} clamp={90} className="text-[14px] leading-snug text-white/95 drop-shadow [&_.tag]:!text-gold2" />}
        <div className="flex items-center gap-3 text-xs text-white/85">
          <div className="marquee-mask flex min-w-0 max-w-[60%] items-center gap-1.5 overflow-hidden">
            <Music2 className="h-3.5 w-3.5 shrink-0" />
            <div className="flex animate-marquee whitespace-nowrap">
              <span className="pr-8">{reel.audioTrack}</span>
              <span className="pr-8">{reel.audioTrack}</span>
            </div>
          </div>
          <span className="flex shrink-0 items-center gap-1">
            <Eye className="h-3.5 w-3.5" /> {compact(reel.viewsCount)}
          </span>
          {isEmbed && (
            <span className="shrink-0 rounded-md bg-white/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider backdrop-blur">
              via {PROVIDER_LABEL[provider]}
            </span>
          )}
        </div>
      </div>

      {/* Progress */}
      {isFile && (
        <div className="absolute inset-x-0 bottom-[84px] z-20 h-[2px] bg-white/20">
          <div className="h-full bg-white/90" style={{ width: `${progress * 100}%` }} />
        </div>
      )}

      <button
        onClick={onToggleMute}
        className="absolute right-3 top-16 z-20 flex h-9 items-center gap-1.5 rounded-full bg-black/40 px-3 text-xs font-semibold text-white backdrop-blur-md"
        aria-label={muted ? 'Unmute' : 'Mute'}
      >
        {muted ? 'Tap for sound 🔇' : '🔊'}
      </button>

      <ActionSheet open={menu} onClose={() => setMenu(false)} items={menuItems} />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await api.deleteReel(reel.id);
          addToast('Reel deleted', 'success');
          onRemove();
        }}
        title="Delete this reel?"
        message="It will be removed from Reels, your profile and any reshares."
        confirmLabel="Delete"
        danger
      />
    </div>
  );
};

const RailButton: React.FC<{ label: string; count?: number; onClick: () => void; children: React.ReactNode }> = ({ label, count, onClick, children }) => (
  <motion.button whileTap={{ scale: 0.82 }} onClick={onClick} aria-label={label} className="flex flex-col items-center gap-1">
    {children}
    {count !== undefined && <span className="text-[12px] font-semibold drop-shadow">{compact(count)}</span>}
  </motion.button>
);
