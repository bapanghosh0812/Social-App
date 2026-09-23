import React, { useEffect } from 'react';
import { motion } from 'framer-motion';

/**
 * The emblem part of /logo.png (ring, building and book), cropped with CSS so
 * the original artwork is used everywhere without a second image file.
 */
const CROP = { x: 267, y: 118, size: 494, full: 1024 };

export const LogoEmblem: React.FC<{ size?: number; className?: string }> = ({ size = 40, className = '' }) => {
  const scale = size / CROP.size;
  return (
    <div className={`relative shrink-0 overflow-hidden rounded-full bg-white ${className}`} style={{ width: size, height: size }}>
      <img
        src="/logo.png"
        alt="College Campus"
        draggable={false}
        style={{
          position: 'absolute',
          width: CROP.full * scale,
          maxWidth: 'none',
          left: -CROP.x * scale,
          top: -CROP.y * scale,
        }}
      />
    </div>
  );
};

/** Emblem + serif wordmark, styled like the logo: navy "COLLEGE", gold "CAMPUS". */
export const BrandMark: React.FC<{ size?: 'sm' | 'lg' }> = ({ size = 'sm' }) => (
  <div className="flex items-center gap-2.5">
    <LogoEmblem size={size === 'lg' ? 56 : 36} className="ring-1 ring-gold/40" />
    <span className={`font-logo font-bold leading-none tracking-[0.06em] ${size === 'lg' ? 'text-[26px]' : 'text-[17px]'}`}>
      <span className="text-brand">COLLEGE</span> <span className="text-gold">CAMPUS</span>
    </span>
  </div>
);

/** Full logo artwork (used on the sign-in screen). */
export const FullLogo: React.FC<{ className?: string }> = ({ className = '' }) => (
  <img
    src="/logo.png"
    alt="College Campus — Connect · Engage · Excel"
    draggable={false}
    className={`select-none mix-blend-multiply dark:rounded-3xl dark:bg-white dark:p-2 dark:mix-blend-normal ${className}`}
  />
);

const WORD_1 = 'COLLEGE';
const WORD_2 = 'CAMPUS';

/**
 * Opening animation: the emblem blinks in, "College Campus" writes itself
 * letter by letter, then the app opens.
 */
export const SplashScreen: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  useEffect(() => {
    const t = setTimeout(onDone, 2900);
    return () => clearTimeout(t);
  }, [onDone]);

  const letter = (ch: string, i: number, gold: boolean) => (
    <motion.span
      key={`${ch}-${i}-${gold}`}
      initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ delay: 1.05 + i * 0.07, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={`inline-block ${gold ? 'text-gold' : 'text-brand'}`}
    >
      {ch}
    </motion.span>
  );

  return (
    <motion.div
      className="fixed inset-0 z-[500] flex flex-col items-center justify-center bg-white"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04, transition: { duration: 0.45, ease: 'easeInOut' } }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: [0, 1, 0.25, 1, 0.45, 1], scale: [0.7, 1.06, 1, 1.02, 1, 1] }}
        transition={{ duration: 1.1, times: [0, 0.3, 0.45, 0.6, 0.78, 1], ease: 'easeOut' }}
        className="relative"
      >
        <div className="absolute inset-0 -z-10 rounded-full bg-gold/25 blur-2xl" />
        <LogoEmblem size={148} />
      </motion.div>

      <div className="mt-7 flex flex-col items-center gap-1.5 font-logo font-bold">
        <div className="text-[34px] leading-none tracking-[0.12em]">{WORD_1.split('').map((c, i) => letter(c, i, false))}</div>
        <div className="flex items-center gap-3">
          <motion.span initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 1.55, duration: 0.5 }} className="h-px w-10 origin-right bg-gold" />
          <div className="text-[24px] leading-none tracking-[0.22em]">{WORD_2.split('').map((c, i) => letter(c, i + WORD_1.length, true))}</div>
          <motion.span initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 1.55, duration: 0.5 }} className="h-px w-10 origin-left bg-gold" />
        </div>
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.05, duration: 0.5 }}
          className="mt-3 font-sans text-[11px] font-semibold uppercase tracking-[0.35em] text-brand/70"
        >
          Connect · Engage · Excel
        </motion.p>
      </div>
    </motion.div>
  );
};
