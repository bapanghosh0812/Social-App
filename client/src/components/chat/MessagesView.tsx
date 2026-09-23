import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Search, PenSquare, Send, MessageCircle, Clapperboard, User as UserIcon, Image as ImageIcon, Sparkles, Trash2 } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { useInboxStore } from '../../store/useInboxStore.js';
import { api, mediaUrl } from '../../services/api.js';
import { realtime } from '../../services/realtime.js';
import type { ChatMessage, Conversation, MiniUser } from '../../types/index.js';
import { clockTime, dayLabel, timeAgo } from '../../lib/format.js';
import { Avatar } from '../ui/Avatar.js';
import { EmptyState, IconButton, Skeleton, Spinner } from '../ui/primitives.js';
import { Sheet } from '../ui/Sheet.js';
import { VerifiedBadge } from '../ui/misc.js';

export const MessagesView: React.FC = () => {
  const { chatWithUserId, openChatWith, goBack, addToast } = useAppStore();
  const [convs, setConvs] = useState<Conversation[] | null>(null);
  const [active, setActive] = useState<Conversation | null>(null);
  const [query, setQuery] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const refreshCounts = useInboxStore((s) => s.refreshCounts);

  const load = useCallback(() => {
    api
      .getConversations()
      .then((r) => setConvs(r.conversations))
      .catch(() => setConvs([]));
  }, []);

  useEffect(load, [load]);

  // Opened from a profile's "Message" button.
  useEffect(() => {
    if (!chatWithUserId) return;
    api
      .openConversation(chatWithUserId)
      .then((r) => setActive(r.conversation))
      .catch((e) => addToast(e.message, 'error'))
      .finally(() => openChatWith(null));
  }, [chatWithUserId]);

  // Live updates to the list.
  useEffect(() => {
    const offs = [
      realtime.on('MESSAGE_NEW', (m) => {
        setConvs((list) => {
          if (!list) return list;
          const idx = list.findIndex((c) => c.id === m.conversationId);
          if (idx === -1) {
            load();
            return list;
          }
          const me = useAuthStore.getState().user?.id;
          const c = list[idx];
          const isActive = active?.id === c.id;
          const updated: Conversation = {
            ...c,
            lastMessage: m.message,
            updatedAt: m.message.createdAt,
            unreadCount: m.message.senderId !== me && !isActive ? (c.unreadCount || 0) + 1 : c.unreadCount,
          };
          return [updated, ...list.filter((_, i) => i !== idx)];
        });
      }),
      realtime.on('PRESENCE', (m) => setConvs((list) => list?.map((c) => (c.otherUserId === m.userId ? { ...c, isOnline: m.online } : c)) || list)),
    ];
    return () => offs.forEach((o) => o());
  }, [active?.id, load]);

  const filtered = useMemo(
    () => (convs || []).filter((c) => c.otherUser.fullName.toLowerCase().includes(query.toLowerCase())),
    [convs, query]
  );

  if (active) {
    return (
      <ChatThread
        conversation={active}
        onBack={() => {
          setActive(null);
          load();
          refreshCounts();
        }}
      />
    );
  }

  return (
    <div className="pb-28">
      <div className="glass sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line px-2 safe-top">
        <IconButton label="Back" onClick={goBack}>
          <ArrowLeft className="h-5 w-5" />
        </IconButton>
        <h1 className="flex-1 font-display text-xl font-semibold text-ink">Messages</h1>
        <IconButton label="New message" onClick={() => setComposeOpen(true)}>
          <PenSquare className="h-5 w-5" />
        </IconButton>
      </div>

      <div className="space-y-2 px-4 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink3" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search chats" className="input rounded-full pl-10" />
        </div>

        {convs === null ? (
          [0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 py-2">
              <Skeleton className="h-14 w-14 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-32 rounded" />
                <Skeleton className="h-3 w-48 rounded" />
              </div>
            </div>
          ))
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<MessageCircle className="h-6 w-6" />}
            title={query ? 'No chats found' : 'Your messages'}
            subtitle={query ? undefined : 'Send private messages, reels and posts to people on campus.'}
            action={
              <button onClick={() => setComposeOpen(true)} className="chip chip-active">
                Send a message
              </button>
            }
          />
        ) : (
          <div className="-mx-2">
            {filtered.map((c) => {
              const unread = (c.unreadCount || 0) > 0;
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    setActive(c);
                    setConvs((l) => l?.map((x) => (x.id === c.id ? { ...x, unreadCount: 0 } : x)) || l);
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl p-2 text-left transition-colors hover:bg-ink/5"
                >
                  <Avatar src={c.otherUser.avatarUrl} name={c.otherUser.fullName} size={56} online={c.isOnline} />
                  <div className="min-w-0 flex-1">
                    <p className={`flex items-center gap-1 truncate text-[15px] ${unread ? 'font-bold text-ink' : 'font-semibold text-ink'}`}>
                      <span className="truncate">{c.otherUser.fullName}</span>
                      <VerifiedBadge status={c.otherUser.verificationStatus} size={13} />
                    </p>
                    <p className={`truncate text-[13px] ${unread ? 'font-semibold text-ink' : 'text-ink3'}`}>
                      {previewText(c)} · {timeAgo(c.lastMessage?.createdAt || c.updatedAt)}
                    </p>
                  </div>
                  {unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <NewMessageSheet
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onPick={async (u) => {
          setComposeOpen(false);
          try {
            const r = await api.openConversation(u.id);
            setActive(r.conversation);
          } catch (e: any) {
            addToast(e.message, 'error');
          }
        }}
      />
    </div>
  );
};

function previewText(c: Conversation): string {
  const m = c.lastMessage;
  const me = useAuthStore.getState().user?.id;
  if (!m) return 'Say hi 👋';
  const prefix = m.senderId === me ? 'You: ' : '';
  if (m.deleted) return `${prefix}Unsent a message`;
  if (m.attachment && !m.body) return `${prefix}Shared a ${m.attachment.type}`;
  return `${prefix}${m.body}`;
}

const NewMessageSheet: React.FC<{ open: boolean; onClose: () => void; onPick: (u: MiniUser) => void }> = ({ open, onClose, onPick }) => {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<MiniUser[]>([]);
  const me = useAuthStore((s) => s.user);
  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    const t = setTimeout(() => {
      (term ? api.searchUsers(term).then((r) => r.users) : api.getSuggestions().then((r) => r.suggestions))
        .then((u) => setResults(u.filter((x) => x.id !== me?.id)))
        .catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q, open]);
  return (
    <Sheet open={open} onClose={onClose} title="New message" height="tall">
      <div className="space-y-3 p-4">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" className="input" />
        <div className="space-y-1">
          {results.map((u) => (
            <button key={u.id} onClick={() => onPick(u)} className="flex w-full items-center gap-3 rounded-2xl p-2 text-left hover:bg-ink/5">
              <Avatar src={u.avatarUrl} name={u.fullName} size={44} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{u.fullName}</p>
                <p className="truncate text-xs text-ink3">{u.headline || u.collegeName || u.companyName}</p>
              </div>
            </button>
          ))}
          {results.length === 0 && <p className="py-6 text-center text-sm text-ink3">Search for someone to message.</p>}
        </div>
      </div>
    </Sheet>
  );
};

const ChatThread: React.FC<{ conversation: Conversation; onBack: () => void }> = ({ conversation, onBack }) => {
  const { openProfile, openPost, openReels, openStories, addToast } = useAppStore();
  const me = useAuthStore((s) => s.user);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState('');
  const [otherReadAt, setOtherReadAt] = useState<string | null>(conversation.otherLastReadAt || null);
  const [typing, setTyping] = useState(false);
  const [online, setOnline] = useState(Boolean(conversation.isOnline));
  const [menuFor, setMenuFor] = useState<ChatMessage | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const typingTimer = useRef<number | undefined>(undefined);
  const lastTypingSent = useRef(0);
  const other = conversation.otherUser;

  const markRead = () => api.markConversationRead(conversation.id).catch(() => {});

  useEffect(() => {
    api
      .getMessages(conversation.id)
      .then((r) => {
        setMessages(r.messages);
        setHasMore(r.hasMore);
        setOtherReadAt(r.otherLastReadAt);
      })
      .catch((e) => {
        addToast(e.message, 'error');
        setMessages([]);
      });
    markRead();

    const offs = [
      realtime.on('MESSAGE_NEW', (m) => {
        if (m.conversationId !== conversation.id) return;
        setMessages((list) => (list && !list.some((x) => x.id === m.message.id) ? [...list.filter((x) => !(x.pending && x.body === m.message.body && m.message.senderId === me?.id)), m.message] : list));
        if (m.message.senderId !== me?.id) {
          setTyping(false);
          markRead();
        }
      }),
      realtime.on('MESSAGE_READ', (m) => m.conversationId === conversation.id && setOtherReadAt(m.readAt)),
      realtime.on('MESSAGE_DELETED', (m) =>
        m.conversationId === conversation.id && setMessages((list) => list?.map((x) => (x.id === m.messageId ? { ...x, deleted: true, body: '', attachment: null } : x)) || list)
      ),
      realtime.on('TYPING', (m) => {
        if (m.conversationId !== conversation.id) return;
        setTyping(true);
        window.clearTimeout(typingTimer.current);
        typingTimer.current = window.setTimeout(() => setTyping(false), 3500);
      }),
      realtime.on('PRESENCE', (m) => m.userId === other.id && setOnline(m.online)),
    ];
    return () => offs.forEach((o) => o());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, typing]);

  const loadOlder = async () => {
    if (!messages?.length) return;
    const el = scroller.current;
    const prevHeight = el?.scrollHeight || 0;
    const r = await api.getMessages(conversation.id, messages[0].createdAt);
    stickToBottom.current = false;
    setMessages((list) => [...r.messages, ...(list || [])]);
    setHasMore(r.hasMore);
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - prevHeight;
    });
  };

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body || !me) return;
    setText('');
    stickToBottom.current = true;
    const temp: ChatMessage = { id: `tmp_${Date.now()}`, conversationId: conversation.id, senderId: me.id, body, createdAt: new Date().toISOString(), pending: true };
    setMessages((l) => [...(l || []), temp]);
    try {
      const r = await api.sendMessage(conversation.id, body);
      setMessages((l) => {
        const list = (l || []).filter((m) => m.id !== temp.id);
        return list.some((m) => m.id === r.message.id) ? list : [...list, r.message];
      });
    } catch (err: any) {
      setMessages((l) => l?.filter((m) => m.id !== temp.id) || l);
      setText(body);
      addToast(err.message, 'error');
    }
  };

  const onType = (v: string) => {
    setText(v);
    if (Date.now() - lastTypingSent.current > 2500) {
      lastTypingSent.current = Date.now();
      realtime.send({ type: 'TYPING', conversationId: conversation.id });
    }
  };

  const unsend = async (m: ChatMessage) => {
    try {
      await api.unsendMessage(m.id);
      setMessages((list) => list?.map((x) => (x.id === m.id ? { ...x, deleted: true, body: '', attachment: null } : x)) || list);
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  const lastMineId = [...(messages || [])].reverse().find((m) => m.senderId === me?.id && !m.pending)?.id;

  const openAttachment = (m: ChatMessage) => {
    const a = m.attachment;
    if (!a) return;
    if (a.type === 'post') openPost(a.id);
    else if (a.type === 'reel') openReels({ startId: a.id });
    else if (a.type === 'profile') openProfile(a.id);
    else if (a.type === 'story') addToast('Stories disappear after 24 hours', 'info');
  };

  return (
    <div className="flex h-[var(--app-h)] flex-col">
      <div className="glass z-30 flex h-16 shrink-0 items-center gap-2 border-b border-line px-2 safe-top">
        <IconButton label="Back" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </IconButton>
        <button onClick={() => openProfile(other.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <Avatar src={other.avatarUrl} name={other.fullName} size={40} online={online} />
          <div className="min-w-0">
            <p className="flex items-center gap-1 truncate text-[15px] font-semibold text-ink">
              {other.fullName} <VerifiedBadge status={other.verificationStatus} size={13} />
            </p>
            <p className="truncate text-xs text-ink3">{typing ? 'typing…' : online ? 'Active now' : other.collegeName || other.companyName}</p>
          </div>
        </button>
      </div>

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4"
      >
        {messages === null ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <>
            {hasMore && (
              <button onClick={loadOlder} className="mx-auto mb-3 block rounded-full border border-line px-4 py-1.5 text-xs font-semibold text-ink2">
                Load earlier messages
              </button>
            )}
            {messages.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Avatar src={other.avatarUrl} name={other.fullName} size={84} />
                <p className="font-display text-xl font-semibold text-ink">{other.fullName}</p>
                <p className="text-sm text-ink3">{other.collegeName}</p>
                <p className="mt-2 text-sm text-ink2">Say hi and start the conversation 👋</p>
              </div>
            )}
            {messages.map((m, i) => {
              const mine = m.senderId === me?.id;
              const prev = messages[i - 1];
              const newDay = !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt);
              const grouped = prev && prev.senderId === m.senderId && !newDay && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
              return (
                <React.Fragment key={m.id}>
                  {newDay && <p className="py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-ink3">{dayLabel(m.createdAt)}</p>}
                  <div className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'} ${grouped ? '' : 'pt-2'}`}>
                    {!mine && <div className="w-7 shrink-0">{!messages[i + 1] || messages[i + 1].senderId !== m.senderId ? <Avatar src={other.avatarUrl} name={other.fullName} size={28} /> : null}</div>}
                    <div className={`flex max-w-[76%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
                      {m.attachment && !m.deleted && (
                        <button onClick={() => openAttachment(m)} className="mb-1 w-56 overflow-hidden rounded-2xl border border-line bg-elev text-left shadow-card">
                          {m.attachment.thumbUrl ? (
                            <img src={mediaUrl(m.attachment.thumbUrl)} alt="" className={`w-full object-cover ${m.attachment.type === 'reel' || m.attachment.type === 'story' ? 'aspect-[4/5]' : 'aspect-video'}`} />
                          ) : (
                            <div className="flex aspect-video items-center justify-center bg-sunken text-ink3">
                              {m.attachment.type === 'reel' ? <Clapperboard className="h-7 w-7" /> : m.attachment.type === 'profile' ? <UserIcon className="h-7 w-7" /> : m.attachment.type === 'story' ? <Sparkles className="h-7 w-7" /> : <ImageIcon className="h-7 w-7" />}
                            </div>
                          )}
                          <div className="p-2.5">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-brand">
                              {m.attachment.type === 'story' ? (mine ? 'Replied to their story' : 'Replied to your story') : m.attachment.type}
                            </p>
                            <p className="truncate text-xs font-semibold text-ink">{m.attachment.authorName}</p>
                            {m.attachment.title && <p className="line-clamp-2 text-xs text-ink2">{m.attachment.title}</p>}
                          </div>
                        </button>
                      )}
                      {(m.body || m.deleted) && (
                        <button
                          onContextMenu={(e) => {
                            if (mine && !m.deleted && !m.pending) {
                              e.preventDefault();
                              setMenuFor(m);
                            }
                          }}
                          onDoubleClick={() => mine && !m.deleted && !m.pending && setMenuFor(m)}
                          title={clockTime(m.createdAt)}
                          className={`whitespace-pre-wrap break-words px-4 py-2.5 text-left text-[15px] leading-snug ${
                            m.deleted
                              ? 'rounded-3xl border border-line italic text-ink3'
                              : mine
                                ? `rounded-3xl bg-brand-grad text-onbrand ${m.pending ? 'opacity-70' : ''}`
                                : 'rounded-3xl bg-elev2 text-ink'
                          } ${/^\p{Extended_Pictographic}{1,3}$/u.test(m.body) && !m.deleted ? '!bg-transparent px-1 text-4xl' : ''}`}
                        >
                          {m.deleted ? 'Message unsent' : m.body}
                        </button>
                      )}
                      {mine && m.id === lastMineId && otherReadAt && otherReadAt >= m.createdAt && <span className="mt-0.5 px-1 text-[11px] text-ink3">Seen</span>}
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
            {typing && (
              <div className="flex items-end gap-2 pt-2">
                <Avatar src={other.avatarUrl} name={other.fullName} size={28} />
                <div className="flex gap-1 rounded-3xl bg-elev2 px-4 py-3.5">
                  {[0, 1, 2].map((d) => (
                    <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-ink3" style={{ animationDelay: `${d * 0.15}s` }} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {conversation.isBlocked ? (
        <p className="border-t border-line p-4 text-center text-sm text-ink3 safe-bottom">You can't message this account.</p>
      ) : (
        <form onSubmit={send} className="flex shrink-0 items-center gap-2 border-t border-line bg-bg/90 p-3 backdrop-blur-xl safe-bottom">
          <div className="flex flex-1 items-center rounded-full border border-line bg-sunken pl-4 pr-1 focus-within:border-brand/50">
            <input value={text} onChange={(e) => onType(e.target.value)} maxLength={2000} placeholder="Message…" className="h-11 flex-1 bg-transparent text-[15px] outline-none" />
            {!text && (
              <button type="button" onClick={() => setText('❤️')} className="px-2 text-xl" aria-label="Heart">
                ❤️
              </button>
            )}
          </div>
          <button type="submit" disabled={!text.trim()} aria-label="Send" className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-grad text-onbrand shadow-brand disabled:opacity-40">
            <Send className="h-5 w-5" />
          </button>
        </form>
      )}

      <Sheet open={Boolean(menuFor)} onClose={() => setMenuFor(null)} maxWidth="sm:max-w-sm">
        <div className="p-2 pb-4 safe-bottom">
          <button
            onClick={() => {
              if (menuFor) unsend(menuFor);
              setMenuFor(null);
            }}
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-[15px] font-medium text-danger hover:bg-ink/5"
          >
            <Trash2 className="h-5 w-5" /> Unsend
          </button>
        </div>
      </Sheet>
    </div>
  );
};
