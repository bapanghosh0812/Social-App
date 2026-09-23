import React, { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, Play } from 'lucide-react';
import type { MediaItem } from '../../types/index.js';
import { mediaUrl } from '../../services/api.js';
import { HeartBurst } from '../ui/misc.js';

/**
 * Swipeable media carousel for posts. Videos autoplay muted while on screen;
 * double-tap (or double-click) triggers `onDoubleTap` with a heart burst.
 */
export const MediaCarousel: React.FC<{ items: MediaItem[]; onDoubleTap?: () => void; aspect?: string }> = ({
  items,
  onDoubleTap,
  aspect = 'aspect-[4/5]',
}) => {
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [burst, setBurst] = useState(false);
  const lastTap = useRef(0);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };

  const handleTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      onDoubleTap?.();
      setBurst(true);
      setTimeout(() => setBurst(false), 950);
      lastTap.current = 0;
    } else {
      lastTap.current = now;
    }
  };

  const go = (i: number) => {
    const el = scroller.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };

  return (
    <div className={`relative w-full overflow-hidden bg-sunken ${aspect}`} onClick={handleTap}>
      <div ref={scroller} onScroll={onScroll} className="no-scrollbar flex h-full w-full snap-x snap-mandatory overflow-x-auto">
        {items.map((m, i) => (
          <div key={m.url + i} className="relative h-full w-full shrink-0 snap-center">
            {m.type === 'video' ? <AutoVideo src={m.url} active={i === index} /> : <SmartImage src={m.url} />}
          </div>
        ))}
      </div>

      <HeartBurst show={burst} />

      {items.length > 1 && (
        <>
          <span className="absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-md">
            {index + 1}/{items.length}
          </span>
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {items.map((_, i) => (
              <button
                key={i}
                onClick={(e) => {
                  e.stopPropagation();
                  go(i);
                }}
                aria-label={`Show item ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${i === index ? 'w-4 bg-white' : 'w-1.5 bg-white/50'}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export const SmartImage: React.FC<{ src: string; className?: string; alt?: string }> = ({ src, className = '', alt = '' }) => {
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      {!loaded && <div className="skeleton absolute inset-0" />}
      <img
        src={mediaUrl(src)}
        alt={alt}
        loading="lazy"
        draggable={false}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        className={`h-full w-full select-none object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'} ${className}`}
      />
    </>
  );
};

/** Muted autoplaying video that pauses when scrolled off screen. */
const AutoVideo: React.FC<{ src: string; active: boolean }> = ({ src, active }) => {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [visible, setVisible] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.intersectionRatio > 0.6), { threshold: [0, 0.6, 1] });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (visible && active && !paused) el.play().catch(() => {});
    else el.pause();
  }, [visible, active, paused]);

  return (
    <div className="relative h-full w-full bg-black">
      <video
        ref={ref}
        src={mediaUrl(src)}
        muted={muted}
        loop
        playsInline
        preload="metadata"
        className="h-full w-full object-cover"
        onClick={(e) => {
          e.stopPropagation();
          setPaused((p) => !p);
        }}
      />
      {paused && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur">
            <Play className="ml-1 h-7 w-7" fill="currentColor" />
          </span>
        </div>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setMuted((m) => !m);
        }}
        aria-label={muted ? 'Unmute' : 'Mute'}
        className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md"
      >
        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
    </div>
  );
};
