import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Heart, MessageCircle, Send, Bookmark, MoreHorizontal, Repeat2, MapPin, Pencil, Trash2, Link2,
  Flag, Ban, BellOff, Play, Share2,
} from 'lucide-react';
import type { Post, Reel } from '../../types/index.js';
import { useAppStore } from '../../store/useAppStore.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { api, mediaUrl } from '../../services/api.js';
import { useRequireVerified } from '../../lib/actions.js';
import { compact, copyText, shareUrl, shortCollege, timeAgo } from '../../lib/format.js';
import { Avatar } from '../ui/Avatar.js';
import { VerifiedBadge, RichText, RoleBadge } from '../ui/misc.js';
import { ActionSheet, ConfirmDialog, type ActionItem } from '../ui/Sheet.js';
import { MediaCarousel, SmartImage } from './MediaCarousel.js';

interface PostCardProps {
  post: Post;
  onChange?: (patch: Partial<Post>) => void;
  onRemove?: () => void;
}

export const PostCard: React.FC<PostCardProps> = ({ post, onChange, onRemove }) => {
  const { openProfile, openCollege, openComments, openShare, openReport, openLikes, openPost, addToast } = useAppStore();
  const { user, updateLocalUser } = useAuthStore();
  const requireVerified = useRequireVerified();

  const [liked, setLiked] = useState(Boolean(post.isLikedByMe));
  const [likes, setLikes] = useState(post.likesCount);
  const [saved, setSaved] = useState(Boolean(post.isSavedByMe));
  const [reposts, setReposts] = useState(post.repostsCount || 0);
  const [likeAnim, setLikeAnim] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | 'delete' | 'block'>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.content);
  const [content, setContent] = useState(post.content);

  useEffect(() => {
    setLiked(Boolean(post.isLikedByMe));
    setLikes(post.likesCount);
    setSaved(Boolean(post.isSavedByMe));
    setReposts(post.repostsCount || 0);
    setContent(post.content);
  }, [post.id, post.isLikedByMe, post.likesCount, post.isSavedByMe, post.repostsCount, post.content]);

  const isOwner = post.isOwner || post.authorId === user?.id;
  const repost = post.repost;
  const isRepost = Boolean(post.repostOf);

  const toggleLike = async (forceLike = false) => {
    if (forceLike && liked) return;
    const next = !liked;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    if (next) setLikeAnim((k) => k + 1);
    try {
      const res = await api.toggleLikePost(post.id);
      setLiked(res.isLikedByMe);
      setLikes(res.likesCount);
      onChange?.({ isLikedByMe: res.isLikedByMe, likesCount: res.likesCount });
    } catch (err: any) {
      setLiked(!next);
      setLikes((n) => n + (next ? -1 : 1));
      addToast(err.message, 'error');
    }
  };

  const toggleSave = async () => {
    const next = !saved;
    setSaved(next);
    try {
      const res = await api.toggleSavePost(post.id);
      setSaved(res.isSaved);
      onChange?.({ isSavedByMe: res.isSaved });
      addToast(res.isSaved ? 'Saved to your collection' : 'Removed from saved', 'success');
    } catch (err: any) {
      setSaved(!next);
      addToast(err.message, 'error');
    }
  };

  const repostTargetId = isRepost && post.repostOf?.type === 'post' ? post.repostOf.id : post.id;
  const toggleRepost = () =>
    requireVerified(async () => {
      try {
        const res = await api.repostPost(repostTargetId);
        setReposts(res.repostsCount);
        onChange?.({ repostsCount: res.repostsCount });
        addToast(res.reposted ? 'Reshared to your feed' : 'Reshare removed', 'success');
      } catch (err: any) {
        addToast(err.message, 'error');
      }
    });

  const doDelete = async () => {
    try {
      await api.deletePost(post.id);
      addToast('Post deleted', 'success');
      onRemove?.();
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  const doBlock = async () => {
    try {
      const res = await api.block(post.authorId);
      addToast(res.message, 'success');
      onRemove?.();
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  const saveEdit = async () => {
    try {
      const res = await api.editPost(post.id, draft.trim());
      setContent(res.post.content);
      onChange?.({ content: res.post.content, editedAt: res.post.editedAt });
      setEditing(false);
      addToast('Post updated', 'success');
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  const share = () =>
    openShare({
      type: 'post',
      id: post.id,
      title: content || (repost && 'content' in repost ? repost.content : '') || 'Post',
      authorName: post.authorName,
      thumbUrl: post.mediaItems?.find((m) => m.type === 'image')?.url,
      canRepost: !isOwner,
    });

  const menu: ActionItem[] = isOwner
    ? [
        ...(!isRepost ? [{ label: 'Edit caption', icon: <Pencil className="h-5 w-5" />, onClick: () => { setDraft(content); setEditing(true); } }] : []),
        { label: 'Copy link', icon: <Link2 className="h-5 w-5" />, onClick: async () => addToast((await copyText(shareUrl('post', post.id))) ? 'Link copied' : 'Could not copy link', 'success') },
        { label: 'Share', icon: <Share2 className="h-5 w-5" />, onClick: share },
        { label: 'Delete post', icon: <Trash2 className="h-5 w-5" />, danger: true, onClick: () => setConfirm('delete') },
      ]
    : [
        { label: saved ? 'Remove from saved' : 'Save', icon: <Bookmark className="h-5 w-5" />, onClick: toggleSave },
        { label: 'Copy link', icon: <Link2 className="h-5 w-5" />, onClick: async () => addToast((await copyText(shareUrl('post', post.id))) ? 'Link copied' : 'Could not copy link', 'success') },
        { label: 'Share', icon: <Share2 className="h-5 w-5" />, onClick: share },
        ...(post.collegeId && post.collegeId !== user?.collegeId
          ? [
              {
                label: `Mute ${shortCollege(post.collegeName) || 'this college'}`,
                icon: <BellOff className="h-5 w-5" />,
                onClick: async () => {
                  try {
                    const res = await api.muteCollege(post.collegeId!, true);
                    updateLocalUser({ mutedCollegeIds: res.mutedCollegeIds });
                    addToast(`${res.message}. You can unmute in Settings.`, 'success');
                    onRemove?.();
                  } catch (err: any) {
                    addToast(err.message, 'error');
                  }
                },
              },
            ]
          : []),
        { label: 'Report', icon: <Flag className="h-5 w-5" />, danger: true, onClick: () => openReport({ targetType: 'post', targetId: post.id, ownerId: post.authorId, ownerName: post.authorName }) },
        { label: `Block ${post.authorName.split(' ')[0]}`, icon: <Ban className="h-5 w-5" />, danger: true, onClick: () => setConfirm('block') },
      ];

  return (
    <motion.article
      layout="position"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="card overflow-hidden"
    >
      {/* Header */}
      {isRepost && (
        <div className="flex items-center gap-1.5 border-b border-line px-4 py-2 text-xs text-ink2">
          <Repeat2 className="h-3.5 w-3.5 text-brand" />
          <button onClick={() => openProfile(post.authorId)} className="font-semibold text-ink hover:underline">
            {post.authorName}
          </button>
          reshared this
        </div>
      )}
      <div className="flex items-start gap-3 px-4 pb-3 pt-4">
        <Avatar src={post.authorAvatar} name={post.authorName} size={46} onClick={() => openProfile(post.authorId)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <button onClick={() => openProfile(post.authorId)} className="truncate text-[15px] font-semibold text-ink hover:underline">
              {post.authorName}
            </button>
            <VerifiedBadge status={post.authorVerificationStatus} />
            <RoleBadge role={post.authorRole} />
          </div>
          {post.authorHeadline && (
            <button
              onClick={() => openProfile(post.authorId)}
              className="block max-w-full truncate text-left text-[12.5px] leading-snug text-ink2 hover:text-brand"
            >
              {post.authorHeadline}
            </button>
          )}
          <div className="flex items-center gap-1 text-[11.5px] text-ink3">
            <span className="shrink-0">{timeAgo(post.createdAt)}</span>
            {post.editedAt && <span className="shrink-0">· edited</span>}
            {post.collegeName && !(post.authorHeadline || '').includes(shortCollege(post.collegeName)) && (
              <>
                <span>·</span>
                <button onClick={() => post.collegeId && openCollege(post.collegeId)} className="flex min-w-0 items-center gap-0.5 truncate hover:text-brand">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{shortCollege(post.collegeName)}</span>
                </button>
              </>
            )}
          </div>
        </div>
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="More options"
          className="flex h-9 w-9 items-center justify-center rounded-full text-ink2 hover:bg-ink/5 hover:text-ink"
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </div>

      {/* Caption (above media for reshares & text posts) */}
      {editing ? (
        <div className="space-y-2 px-4 pb-3">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} maxLength={5000} className="input resize-none" autoFocus />
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(false)} className="h-8 rounded-xl px-3 text-xs font-semibold text-ink2 hover:bg-ink/5">
              Cancel
            </button>
            <button onClick={saveEdit} className="h-8 rounded-xl bg-brand-grad px-4 text-xs font-semibold text-onbrand">
              Save
            </button>
          </div>
        </div>
      ) : (
        content && (post.mediaItems.length === 0 || isRepost) && (
          <RichText text={content} className={`px-4 pb-3 text-ink ${post.mediaItems.length === 0 && !isRepost && content.length < 140 ? 'font-display text-[19px] leading-snug' : 'text-[15px] leading-relaxed'}`} />
        )
      )}

      {/* Media */}
      {post.mediaItems.length > 0 && <MediaCarousel items={post.mediaItems} onDoubleTap={() => toggleLike(true)} />}

      {/* Reshared content */}
      {isRepost && (
        <div className="px-4 pb-1">
          {repost ? (
            'videoUrl' in repost ? (
              <RepostedReel reel={repost as Reel} />
            ) : (
              <button onClick={() => openPost(repost.id)} className="block w-full overflow-hidden rounded-2xl border border-line2 bg-sunken/60 text-left transition-colors hover:border-brand/40">
                <div className="flex items-center gap-2 px-3 pt-3">
                  <Avatar src={(repost as Post).authorAvatar} name={(repost as Post).authorName} size={22} />
                  <span className="truncate text-[13px] font-semibold text-ink">{(repost as Post).authorName}</span>
                  <VerifiedBadge status={(repost as Post).authorVerificationStatus} size={13} />
                  <span className="text-xs text-ink3">· {timeAgo((repost as Post).createdAt)}</span>
                </div>
                {(repost as Post).content && <p className="line-clamp-3 px-3 pt-1.5 text-sm text-ink2">{(repost as Post).content}</p>}
                {(repost as Post).mediaItems?.[0] && (
                  <div className="relative mt-2.5 aspect-[16/10] w-full">
                    <SmartImage src={(repost as Post).mediaItems[0].url} />
                  </div>
                )}
                {!(repost as Post).mediaItems?.length && <div className="h-3" />}
              </button>
            )
          ) : (
            <div className="rounded-2xl border border-dashed border-line2 p-4 text-center text-sm text-ink3">This content is no longer available.</div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 px-2 pt-2">
        <ActionButton label="Like" onClick={() => toggleLike()} active={liked}>
          <Heart key={likeAnim} className={`h-[23px] w-[23px] ${liked ? 'animate-like fill-[#E0245E] text-[#E0245E]' : ''}`} />
        </ActionButton>
        <ActionButton label="Comment" onClick={() => openComments('post', post.id, post.authorId)}>
          <MessageCircle className="h-[22px] w-[22px]" />
        </ActionButton>
        {!isOwner && (
          <ActionButton label="Reshare" onClick={toggleRepost}>
            <Repeat2 className="h-[23px] w-[23px]" />
          </ActionButton>
        )}
        <ActionButton label="Share" onClick={share}>
          <Send className="h-[21px] w-[21px] -rotate-12" />
        </ActionButton>
        <div className="flex-1" />
        <ActionButton label={saved ? 'Unsave' : 'Save'} onClick={toggleSave}>
          <Bookmark className={`h-[22px] w-[22px] ${saved ? 'fill-brand text-brand' : ''}`} />
        </ActionButton>
      </div>

      {/* Counts + caption + comments */}
      <div className="space-y-1.5 px-4 pb-4 pt-1">
        <div className="flex flex-wrap items-center gap-x-3 text-[13px]">
          {likes > 0 && (
            <button onClick={() => openLikes({ type: 'post', id: post.id })} className="font-semibold text-ink hover:underline">
              {compact(likes)} {likes === 1 ? 'like' : 'likes'}
            </button>
          )}
          {reposts > 0 && <span className="text-ink2">{compact(reposts)} reshares</span>}
          {post.sharesCount > 0 && <span className="text-ink2">{compact(post.sharesCount)} shares</span>}
        </div>
        {content && post.mediaItems.length > 0 && !isRepost && !editing && (
          <RichText
            text={content}
            className="text-[14px] leading-relaxed text-ink"
            prefix={<button onClick={() => openProfile(post.authorId)} className="mr-1.5 font-semibold text-ink">{post.authorName}</button>}
          />
        )}
        {post.commentsCount > 0 ? (
          <button onClick={() => openComments('post', post.id, post.authorId)} className="text-[13px] text-ink3 hover:text-ink2">
            View {post.commentsCount === 1 ? '1 comment' : `all ${compact(post.commentsCount)} comments`}
          </button>
        ) : (
          <button onClick={() => openComments('post', post.id, post.authorId)} className="flex items-center gap-2 pt-1 text-[13px] text-ink3 hover:text-ink2">
            <Avatar src={user?.avatarUrl} name={user?.fullName} size={22} />
            Add a comment…
          </button>
        )}
      </div>

      <ActionSheet open={menuOpen} onClose={() => setMenuOpen(false)} items={menu} />
      <ConfirmDialog
        open={confirm === 'delete'}
        onClose={() => setConfirm(null)}
        onConfirm={doDelete}
        title="Delete this post?"
        message="It will be removed from every feed along with its likes and comments. This can't be undone."
        confirmLabel="Delete"
        danger
      />
      <ConfirmDialog
        open={confirm === 'block'}
        onClose={() => setConfirm(null)}
        onConfirm={doBlock}
        title={`Block ${post.authorName}?`}
        message="They won't be able to see your profile, posts or message you, and you won't see theirs. They aren't notified."
        confirmLabel="Block"
        danger
      />
    </motion.article>
  );
};

const ActionButton: React.FC<{ label: string; onClick: () => void; active?: boolean; children: React.ReactNode }> = ({ label, onClick, active, children }) => (
  <motion.button
    whileTap={{ scale: 0.85 }}
    onClick={onClick}
    aria-label={label}
    aria-pressed={active}
    className="flex h-10 w-10 items-center justify-center rounded-full text-ink transition-colors hover:bg-ink/5"
  >
    {children}
  </motion.button>
);

const RepostedReel: React.FC<{ reel: Reel }> = ({ reel }) => {
  const openReels = useAppStore((s) => s.openReels);
  const playable = reel.provider === 'upload' || reel.provider === 'direct';
  return (
    <button
      onClick={() => openReels({ startId: reel.id })}
      className="relative block aspect-[4/5] w-full overflow-hidden rounded-2xl border border-line2 bg-black text-left"
    >
      {reel.thumbnailUrl ? (
        <img src={mediaUrl(reel.thumbnailUrl)} alt="" className="h-full w-full object-cover opacity-90" loading="lazy" />
      ) : playable ? (
        <video src={`${mediaUrl(reel.videoUrl)}#t=0.5`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-black/30" />
      <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
        <Play className="h-3 w-3" fill="currentColor" /> Reel
      </span>
      <div className="absolute inset-x-3 bottom-3 flex items-center gap-2 text-white">
        <Avatar src={reel.authorAvatar} name={reel.authorName} size={26} />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">{reel.authorName}</p>
          <p className="truncate text-xs text-white/80">{reel.caption}</p>
        </div>
      </div>
    </button>
  );
};
