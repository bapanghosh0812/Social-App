import React, { useEffect, useRef, useState } from 'react';
import { Heart, Send, Eye } from 'lucide-react';
import type { LiveChatMessage } from '../../types/index.js';
import { Avatar } from '../ui/Avatar.js';

/** Shared live UI: floating hearts, chat stream and chat composer. */
export const FloatingHearts: React.FC<{ hearts: number[] }> = ({ hearts }) => (
  <div className="pointer-events-none absolute bottom-24 right-4 z-30 h-72 w-16">
    {hearts.map((k) => (
      <Heart
        key={k}
        className="absolute bottom-0 h-8 w-8 animate-float-up fill-[#FF3B5C] text-[#FF3B5C] drop-shadow"
        style={{ left: `${(k % 5) * 6}px`, animationDuration: `${2 + (k % 3) * 0.4}s` }}
      />
    ))}
  </div>
);

export const LiveChat: React.FC<{ messages: LiveChatMessage[] }> = ({ messages }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);
  return (
    <div
      ref={ref}
      className="no-scrollbar max-h-52 space-y-2 overflow-y-auto pr-16 [mask-image:linear-gradient(to_bottom,transparent,black_30%)]"
    >
      {messages.map((m) => (
        <div key={m.id} className="flex items-start gap-2 text-white">
          <Avatar src={m.user.avatarUrl} name={m.user.fullName} size={26} />
          <p className="text-[13px] leading-snug drop-shadow">
            <span className="mr-1.5 font-semibold text-white/80">{m.user.fullName.split(' ')[0]}</span>
            {m.text}
          </p>
        </div>
      ))}
    </div>
  );
};

export const LiveComposer: React.FC<{ onSend: (text: string) => void; onHeart: () => void; placeholder?: string }> = ({ onSend, onHeart, placeholder = 'Comment…' }) => {
  const [text, setText] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        onSend(text.trim());
        setText('');
      }}
      className="flex items-center gap-2"
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={300}
        placeholder={placeholder}
        className="h-11 flex-1 rounded-full border border-white/30 bg-black/30 px-4 text-sm text-white placeholder:text-white/60 outline-none backdrop-blur-md focus:border-white/70"
      />
      {text.trim() ? (
        <button type="submit" aria-label="Send" className="flex h-11 w-11 items-center justify-center rounded-full bg-gold-grad text-black">
          <Send className="h-4 w-4" />
        </button>
      ) : (
        <button type="button" onClick={onHeart} aria-label="Send a heart" className="flex h-11 w-11 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-md">
          <Heart className="h-5 w-5 fill-[#FF3B5C] text-[#FF3B5C]" />
        </button>
      )}
    </form>
  );
};

export const LiveBadge: React.FC<{ viewers: number; elapsed?: number }> = ({ viewers, elapsed }) => (
  <div className="flex items-center gap-1.5">
    <span className="rounded-md bg-live-grad px-2 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white">Live</span>
    <span className="flex items-center gap-1 rounded-md bg-black/45 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur">
      <Eye className="h-3.5 w-3.5" /> {viewers}
    </span>
    {elapsed !== undefined && (
      <span className="rounded-md bg-black/45 px-2 py-1 font-mono text-[11px] font-semibold text-white backdrop-blur">
        {String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}
      </span>
    )}
  </div>
);
