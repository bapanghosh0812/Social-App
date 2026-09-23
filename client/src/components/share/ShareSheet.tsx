import React, { useEffect, useMemo, useState } from 'react';
import { Check, Link2, Repeat2, PlusCircle, Share2, Search, Send, MessageCircle } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { useFeedStore } from '../../store/useFeedStore.js';
import { useRequireVerified } from '../../lib/actions.js';
import { api, mediaUrl } from '../../services/api.js';
import type { MiniUser } from '../../types/index.js';
import { copyText, firstName, shareUrl } from '../../lib/format.js';
import { Sheet } from '../ui/Sheet.js';
import { Avatar } from '../ui/Avatar.js';
import { Button } from '../ui/primitives.js';

export const ShareSheet: React.FC = () => {
  const { share, closeShare, addToast } = useAppStore();
  const { user } = useAuthStore();
  const { addStory, patchPost, fetchFeed } = useFeedStore();
  const requireVerified = useRequireVerified();

  const [people, setPeople] = useState<MiniUser[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MiniUser[] | null>(null);
  const [selected, setSelected] = useState<Record<string, MiniUser>>({});
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!share) return;
    setSelected({});
    setNote('');
    setQuery('');
    setResults(null);
    api
      .getConversations()
      .then((res) => setPeople(res.conversations.filter((c) => !c.isBlocked).map((c) => c.otherUser)))
      .catch(() => setPeople([]));
  }, [share?.id]);

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    const t = setTimeout(() => {
      api
        .searchUsers(query.trim())
        .then((res) => setResults(res.users.filter((u) => u.id !== user?.id)))
        .catch(() => setResults([]));
    }, 220);
    return () => clearTimeout(t);
  }, [query]);

  const list = results ?? people;
  const selectedList = useMemo(() => Object.values(selected), [selected]);
  if (!share) return <Sheet open={false} onClose={closeShare}>{null}</Sheet>;

  const link = shareUrl(share.type === 'profile' ? 'user' : share.type === 'reel' ? 'reel' : 'post', share.id);
  const countShare = () => {
    if (share.type === 'post') api.sharePost(share.id).then((r) => patchPost(share.id, { sharesCount: r.sharesCount })).catch(() => {});
    if (share.type === 'reel') api.shareReel(share.id).catch(() => {});
  };

  const toggle = (u: MiniUser) =>
    setSelected((s) => {
      const next = { ...s };
      if (next[u.id]) delete next[u.id];
      else next[u.id] = u;
      return next;
    });

  const send = async () => {
    if (!selectedList.length) return;
    setSending(true);
    try {
      const res = await api.sendTo(selectedList.map((u) => u.id), note.trim(), { type: share.type, id: share.id });
      addToast(`Sent to ${res.sent === 1 ? firstName(selectedList[0].fullName) : `${res.sent} people`}`, 'success');
      countShare();
      closeShare();
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setSending(false);
    }
  };

  const repost = () =>
    requireVerified(async () => {
      try {
        const res = share.type === 'reel' ? await api.repostReel(share.id) : await api.repostPost(share.id);
        addToast(res.reposted ? 'Reshared to your feed' : 'Reshare removed', 'success');
        if (share.type === 'post') patchPost(share.id, { repostsCount: res.repostsCount });
        window.dispatchEvent(new CustomEvent('cc:reposted', { detail: { type: share.type, id: share.id, count: res.repostsCount } }));
        fetchFeed(true);
        closeShare();
      } catch (err: any) {
        addToast(err.message, 'error');
      }
    });

  const toStory = () =>
    requireVerified(async () => {
      if (share.type !== 'post' && share.type !== 'reel') return;
      try {
        const res = await api.createStory({ ref: { type: share.type, id: share.id } });
        addStory(res.story);
        addToast('Added to your story for 24 hours', 'success');
        closeShare();
      } catch (err: any) {
        addToast(err.message, 'error');
      }
    });

  const copy = async () => {
    const ok = await copyText(link);
    addToast(ok ? 'Link copied' : 'Could not copy link', ok ? 'success' : 'error');
    if (ok) countShare();
  };

  const whatsapp = () => {
    const text = `${share.title ? `"${share.title.slice(0, 80)}" — ` : ''}${share.authorName} on College Campus ${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
    countShare();
  };

  const native = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'College Campus', text: share.title?.slice(0, 120) || `${share.authorName} on College Campus`, url: link });
        countShare();
      } catch {
        /* dismissed */
      }
    } else copy();
  };

  const canStory = (share.type === 'post' || share.type === 'reel') && Boolean(share.thumbUrl || share.type === 'reel');

  return (
    <Sheet
      open
      onClose={closeShare}
      title="Share"
      subtitle={`${share.type === 'profile' ? 'Profile' : share.type[0].toUpperCase() + share.type.slice(1)} by ${share.authorName}`}
      height="tall"
      zIndex={70}
      footer={
        selectedList.length > 0 ? (
          <div className="space-y-2">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Write a message…" maxLength={500} className="input" />
            <Button full size="lg" loading={sending} onClick={send} icon={<Send className="h-4 w-4" />}>
              Send {selectedList.length > 1 ? `separately (${selectedList.length})` : ''}
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-5 px-5 py-4">
        {/* Preview */}
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-sunken/60 p-3">
          {share.thumbUrl ? (
            <img src={mediaUrl(share.thumbUrl)} alt="" className="h-14 w-14 rounded-xl object-cover" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <MessageCircle className="h-6 w-6" />
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{share.authorName}</p>
            <p className="line-clamp-2 text-xs text-ink2">{share.title || 'Shared from College Campus'}</p>
          </div>
        </div>

        {/* Send to people */}
        <div>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink3" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people" className="input pl-10" />
          </div>
          {list.length === 0 ? (
            <p className="py-3 text-center text-sm text-ink3">{results ? 'No people found.' : 'Search for someone to send this to.'}</p>
          ) : (
            <div className="grid grid-cols-4 gap-x-2 gap-y-4">
              {list.slice(0, 12).map((u) => {
                const on = Boolean(selected[u.id]);
                return (
                  <button key={u.id} onClick={() => toggle(u)} className="flex flex-col items-center gap-1.5">
                    <div className="relative">
                      <Avatar src={u.avatarUrl} name={u.fullName} size={56} ring={on ? 'gold' : null} />
                      {on && (
                        <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-grad text-onbrand ring-2 ring-elev">
                          <Check className="h-3 w-3" strokeWidth={3} />
                        </span>
                      )}
                    </div>
                    <span className="line-clamp-2 text-center text-[11px] leading-tight text-ink2">{u.fullName}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Other actions */}
        <div className="grid grid-cols-4 gap-2 border-t border-line pt-4">
          {share.canRepost && (share.type === 'post' || share.type === 'reel') && (
            <ShareAction label="Reshare" onClick={repost} icon={<Repeat2 className="h-5 w-5" />} />
          )}
          {canStory && <ShareAction label="Add to story" onClick={toStory} icon={<PlusCircle className="h-5 w-5" />} />}
          <ShareAction label="Copy link" onClick={copy} icon={<Link2 className="h-5 w-5" />} />
          <ShareAction
            label="WhatsApp"
            onClick={whatsapp}
            icon={
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                <path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.1c-.2-.5-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3zM12 21.8c-1.7 0-3.4-.5-4.9-1.3l-.4-.2-3.6.9 1-3.5-.2-.4C3 15.8 2.5 14 2.5 12.2 2.5 7 6.8 2.7 12 2.7s9.5 4.3 9.5 9.5-4.3 9.6-9.5 9.6zM12 .8C5.8.8.8 5.9.8 12.1c0 2 .5 3.9 1.5 5.6L.7 23.3l5.8-1.5c1.6.9 3.5 1.4 5.4 1.4 6.2 0 11.3-5.1 11.3-11.3S18.2.8 12 .8z" />
              </svg>
            }
          />
          <ShareAction label="More" onClick={native} icon={<Share2 className="h-5 w-5" />} />
        </div>
      </div>
    </Sheet>
  );
};

const ShareAction: React.FC<{ label: string; icon: React.ReactNode; onClick: () => void }> = ({ label, icon, onClick }) => (
  <button onClick={onClick} className="flex flex-col items-center gap-1.5">
    <span className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-elev2 text-ink transition-colors hover:border-brand/50 hover:text-brand">
      {icon}
    </span>
    <span className="text-center text-[11px] text-ink2">{label}</span>
  </button>
);
