import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BadgeCheck, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore.js';
import { tokenize } from '../../lib/format.js';

/** Gold seal shown next to verified members. */
export const VerifiedBadge: React.FC<{ status?: string; size?: number; className?: string }> = ({ status, size = 15, className = '' }) =>
  status === 'Verified Member' ? (
    <BadgeCheck
      aria-label="Verified member"
      style={{ width: size, height: size }}
      className={`inline-block shrink-0 fill-gold text-white ${className}`}
      strokeWidth={2.4}
    />
  ) : null;

/** Small role tag shown next to teachers' names. */
export const RoleBadge: React.FC<{ role?: string; className?: string }> = ({ role, className = '' }) =>
  role === 'faculty' ? (
    <span className={`shrink-0 rounded-md border border-gold/40 bg-gold/10 px-1.5 py-[1px] text-[9.5px] font-bold uppercase tracking-wider text-gold ${className}`}>
      Faculty
    </span>
  ) : null;

/** Caption text with tappable #hashtags and expandable long text. */
export const RichText: React.FC<{ text: string; className?: string; clamp?: number; prefix?: React.ReactNode }> = ({
  text,
  className = '',
  clamp = 220,
  prefix,
}) => {
  const searchTag = useAppStore((s) => s.searchTag);
  const [expanded, setExpanded] = useState(false);
  if (!text && !prefix) return null;
  const long = text.length > clamp;
  const shown = long && !expanded ? `${text.slice(0, clamp).trimEnd()}…` : text;
  return (
    <p className={`rich whitespace-pre-wrap break-words ${className}`}>
      {prefix}
      {tokenize(shown).map((part, i) =>
        part.kind === 'tag' ? (
          <button
            key={i}
            type="button"
            className="tag"
            onClick={(e) => {
              e.stopPropagation();
              searchTag(part.value.slice(1));
            }}
          >
            {part.value}
          </button>
        ) : part.kind === 'mention' ? (
          <span key={i} className="font-semibold text-brand">
            {part.value}
          </span>
        ) : (
          <React.Fragment key={i}>{part.value}</React.Fragment>
        )
      )}
      {long && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className="ml-1 font-medium text-ink3 hover:text-ink2"
        >
          {expanded ? 'less' : 'more'}
        </button>
      )}
    </p>
  );
};

/** Floating toast notifications. */
export const Toaster: React.FC = () => {
  const { toasts, removeToast } = useAppStore();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4 safe-top">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            onClick={() => removeToast(t.id)}
            className="glass pointer-events-auto flex max-w-sm cursor-pointer items-center gap-2.5 rounded-2xl border border-line2 px-4 py-3 text-sm font-medium text-ink shadow-lift"
          >
            {t.type === 'success' ? (
              <CheckCircle2 className="h-[18px] w-[18px] shrink-0 text-success" />
            ) : t.type === 'error' ? (
              <AlertCircle className="h-[18px] w-[18px] shrink-0 text-danger" />
            ) : (
              <Info className="h-[18px] w-[18px] shrink-0 text-brand" />
            )}
            <span className="flex-1">{t.message}</span>
            {t.action && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  t.action!.run();
                  removeToast(t.id);
                }}
                className="shrink-0 font-semibold text-brand"
              >
                {t.action.label}
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

/** Big heart that pops on double-tap. */
export const HeartBurst: React.FC<{ show: boolean; x?: number; y?: number; size?: number }> = ({ show, x, y, size = 96 }) => (
  <AnimatePresence>
    {show && (
      <div
        className="pointer-events-none absolute z-30"
        style={x !== undefined && y !== undefined ? { left: x - size / 2, top: y - size / 2 } : { inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <svg viewBox="0 0 24 24" style={{ width: size, height: size }} className="animate-heart-pop drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
          <defs>
            <linearGradient id="hb" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FF7A8A" />
              <stop offset="100%" stopColor="#E0245E" />
            </linearGradient>
          </defs>
          <path
            fill="url(#hb)"
            d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
          />
        </svg>
      </div>
    )}
  </AnimatePresence>
);
