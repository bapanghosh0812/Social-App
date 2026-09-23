import React, { useEffect, useRef, useState } from 'react';
import { Heart, Send, MessageCircle, Trash2, Flag } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { useFeedStore } from '../../store/useFeedStore.js';
import { useRequireVerified } from '../../lib/actions.js';
import { api } from '../../services/api.js';
import type { Comment } from '../../types/index.js';
import { compact, timeAgo } from '../../lib/format.js';
import { Sheet } from '../ui/Sheet.js';
import { Avatar } from '../ui/Avatar.js';
import { EmptyState, Skeleton } from '../ui/primitives.js';
import { RichText, RoleBadge, VerifiedBadge } from '../ui/misc.js';

const QUICK = ['❤️', '🔥', '👏', '😂', '😍', '🙌', '💯', '🎉'];

/** Comments for a post or reel. Emits a window event so counters elsewhere update. */
export const CommentsSheet: React.FC = () => {
  const { comments: target, closeComments, openProfile, openReport, addToast } = useAppStore();
  const { user } = useAuthStore();
  const patchPost = useFeedStore((s) => s.patchPost);
  const requireVerified = useRequireVerified();

  const [list, setList] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!target) return;
    setList([]);
    setText('');
    setLoading(true);
    api
      .getComments(target.type, target.id)
      .then((res) => setList(res.comments))
      .catch((err) => addToast(err.message, 'error'))
      .finally(() => setLoading(false));
  }, [target?.type, target?.id]);

  const broadcastCount = (count: number) => {
    if (!target) return;
    if (target.type === 'post') patchPost(target.id, { commentsCount: count });
    window.dispatchEvent(new CustomEvent('cc:comments', { detail: { type: target.type, id: target.id, count } }));
  };

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!target || !text.trim()) return;
    requireVerified(async () => {
      setSending(true);
      try {
        const res = await api.addComment(target.type, target.id, text.trim());
        setList((l) => [...l, res.comment]);
        setText('');
        broadcastCount(res.commentsCount);
        setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }), 50);
      } catch (err: any) {
        addToast(err.message, 'error');
      } finally {
        setSending(false);
      }
    });
  };

  const like = async (c: Comment) => {
    if (!target) return;
    const next = !c.isLikedByMe;
    setList((l) => l.map((x) => (x.id === c.id ? { ...x, isLikedByMe: next, likesCount: x.likesCount + (next ? 1 : -1) } : x)));
    try {
      const res = await api.likeComment(target.type, target.id, c.id);
      setList((l) => l.map((x) => (x.id === c.id ? { ...x, isLikedByMe: res.isLiked, likesCount: res.likesCount } : x)));
    } catch (err: any) {
      setList((l) => l.map((x) => (x.id === c.id ? { ...x, isLikedByMe: !next, likesCount: x.likesCount + (next ? -1 : 1) } : x)));
      addToast(err.message, 'error');
    }
  };

  const remove = async (c: Comment) => {
    if (!target) return;
    try {
      const res = await api.deleteComment(target.type, target.id, c.id);
      setList((l) => l.filter((x) => x.id !== c.id));
      broadcastCount(res.commentsCount);
      addToast('Comment deleted', 'success');
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  const reply = (c: Comment) => {
    const handle = `@${c.authorName.replace(/\s+/g, '')} `;
    setText((t) => (t.startsWith(handle) ? t : handle + t));
    inputRef.current?.focus();
  };

  const canComment = user?.verificationStatus === 'Verified Member';

  return (
    <Sheet
      open={Boolean(target)}
      onClose={closeComments}
      title="Comments"
      subtitle={list.length ? `${list.length} ${list.length === 1 ? 'comment' : 'comments'}` : undefined}
      height="tall"
      zIndex={65}
      footer={
        <form onSubmit={submit} className="space-y-2.5">
          <div className="no-scrollbar flex gap-1 overflow-x-auto">
            {QUICK.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setText((t) => t + e)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl transition-transform hover:bg-ink/5 active:scale-125"
              >
                {e}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2.5">
            <Avatar src={user?.avatarUrl} name={user?.fullName} size={34} />
            <div className="flex flex-1 items-center rounded-full border border-line bg-sunken pl-4 pr-1.5 focus-within:border-brand/50">
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={2000}
                placeholder={canComment ? 'Add a comment…' : 'Get verified to join the conversation'}
                onFocus={() => !canComment && requireVerified(() => {})}
                className="h-11 flex-1 bg-transparent text-sm outline-none"
              />
              <button
                type="submit"
                disabled={!text.trim() || sending}
                className="flex h-8 items-center gap-1 rounded-full bg-brand-grad px-3 text-xs font-semibold text-onbrand transition-opacity disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" /> Post
              </button>
            </div>
          </div>
        </form>
      }
    >
      <div ref={listRef} className="h-full space-y-5 overflow-y-auto px-5 py-4">
        {loading ? (
          [0, 1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-32 rounded" />
                <Skeleton className="h-3 w-full rounded" />
              </div>
            </div>
          ))
        ) : list.length === 0 ? (
          <EmptyState compact icon={<MessageCircle className="h-6 w-6" />} title="No comments yet" subtitle="Start the conversation." />
        ) : (
          list.map((c) => (
            <div key={c.id} className="group flex gap-3">
              <Avatar src={c.authorAvatar} name={c.authorName} size={36} onClick={() => openProfile(c.authorId)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 text-[13px]">
                  <button onClick={() => openProfile(c.authorId)} className="font-semibold text-ink hover:underline">
                    {c.authorName}
                  </button>
                  <VerifiedBadge status={c.authorVerificationStatus} size={13} />
                  <RoleBadge role={c.authorRole} />
                  <span className="text-xs text-ink3">{timeAgo(c.createdAt)}</span>
                </div>
                {c.authorHeadline && <p className="truncate text-[11.5px] text-ink3">{c.authorHeadline}</p>}
                <RichText text={c.content} className="mt-0.5 text-[14px] leading-relaxed text-ink" clamp={400} />
                <div className="mt-1.5 flex items-center gap-4 text-xs font-semibold text-ink3">
                  {c.likesCount > 0 && <span>{compact(c.likesCount)} {c.likesCount === 1 ? 'like' : 'likes'}</span>}
                  <button onClick={() => reply(c)} className="hover:text-ink2">
                    Reply
                  </button>
                  {c.canDelete ? (
                    <button onClick={() => remove(c)} className="flex items-center gap-1 hover:text-danger">
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  ) : (
                    c.authorId !== user?.id && (
                      <button
                        onClick={() =>
                          openReport({ targetType: 'comment', targetId: c.id, parentId: target?.id, ownerId: c.authorId, ownerName: c.authorName })
                        }
                        className="flex items-center gap-1 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                      >
                        <Flag className="h-3 w-3" /> Report
                      </button>
                    )
                  )}
                </div>
              </div>
              <button onClick={() => like(c)} aria-label="Like comment" className="self-start pt-1 text-ink3 hover:text-ink">
                <Heart className={`h-4 w-4 ${c.isLikedByMe ? 'animate-like fill-[#E0245E] text-[#E0245E]' : ''}`} />
              </button>
            </div>
          ))
        )}
      </div>
    </Sheet>
  );
};
