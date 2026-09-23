import React, { useState } from 'react';
import { mediaUrl } from '../../services/api.js';

interface AvatarProps {
  src?: string;
  name?: string;
  size?: number;
  className?: string;
  onClick?: () => void;
  ring?: 'story' | 'seen' | 'live' | 'gold' | null;
  online?: boolean;
  square?: boolean;
}

const GRADIENTS = [
  'from-[#E9C987] to-[#9E7A2C]',
  'from-[#C9B8E8] to-[#6B5A9E]',
  'from-[#A7D7C5] to-[#3F7F6A]',
  'from-[#F2B8A2] to-[#A5553A]',
  'from-[#B7CCE8] to-[#4A6A9E]',
];

/** Avatar with monogram fallback, optional story/live ring and presence dot. */
export const Avatar: React.FC<AvatarProps> = ({ src, name, size = 36, className = '', onClick, ring, online, square }) => {
  const [broken, setBroken] = useState(false);
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  const grad = GRADIENTS[(name || '?').charCodeAt(0) % GRADIENTS.length];
  const radius = square ? 'rounded-[28%]' : 'rounded-full';
  const url = mediaUrl(src);

  const inner =
    url && !broken ? (
      <img
        src={url}
        alt={name || ''}
        onError={() => setBroken(true)}
        loading="lazy"
        draggable={false}
        style={{ width: size, height: size }}
        className={`${radius} object-cover bg-sunken`}
      />
    ) : (
      <div
        style={{ width: size, height: size, fontSize: Math.max(11, size * 0.4) }}
        className={`${radius} flex items-center justify-center bg-gradient-to-br ${grad} font-display font-semibold text-white`}
      >
        {initial}
      </div>
    );

  const ringClass =
    ring === 'story'
      ? 'story-ring'
      : ring === 'seen'
        ? 'story-ring-seen'
        : ring === 'live'
          ? 'rounded-full bg-live-grad p-[2.5px]'
          : ring === 'gold'
            ? 'rounded-full bg-gold-grad p-[2px]'
            : '';

  return (
    <div
      className={`relative shrink-0 ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      {ring ? (
        <div className={ringClass}>
          <div className={`${radius} bg-bg p-[2px]`}>{inner}</div>
        </div>
      ) : (
        inner
      )}
      {online && (
        <span
          className="absolute bottom-0 right-0 rounded-full border-2 border-bg bg-success"
          style={{ width: Math.max(9, size * 0.26), height: Math.max(9, size * 0.26) }}
        />
      )}
    </div>
  );
};
