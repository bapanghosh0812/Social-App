import React from 'react';
import { motion } from 'framer-motion';
import { Home, Compass, Clapperboard, Plus } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { Avatar } from '../ui/Avatar.js';
import type { ActiveTab } from '../../types/index.js';

export const BottomNav: React.FC = () => {
  const { activeTab, setActiveTab, openPublish, profileUserId } = useAppStore();
  const { user } = useAuthStore();
  const onReels = activeTab === 'reels';

  const Item: React.FC<{ tab: ActiveTab; label: string; children: React.ReactNode }> = ({ tab, label, children }) => {
    const active = activeTab === tab && !(tab === 'profile' && profileUserId && profileUserId !== user?.id);
    return (
      <button
        onClick={() => setActiveTab(tab)}
        aria-label={label}
        className={`relative flex h-12 w-12 flex-col items-center justify-center transition-colors ${
          active ? (onReels ? 'text-white' : 'text-brand') : onReels ? 'text-white/60' : 'text-ink3 hover:text-ink2'
        }`}
      >
        {children}
        {active && <motion.span layoutId="nav-dot" className="absolute bottom-1 h-1 w-1 rounded-full bg-brand" />}
      </button>
    );
  };

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-3 safe-bottom">
      <div
        className={`pointer-events-auto flex w-full max-w-[420px] items-center justify-around rounded-[26px] border px-2 py-1 shadow-lift ${
          onReels ? 'border-white/10 bg-black/55 backdrop-blur-xl' : 'glass border-line2'
        }`}
      >
        <Item tab="home" label="Home">
          <Home className="h-[23px] w-[23px]" strokeWidth={activeTab === 'home' ? 2.4 : 1.9} />
        </Item>
        <Item tab="explore" label="Explore">
          <Compass className="h-[23px] w-[23px]" strokeWidth={activeTab === 'explore' ? 2.4 : 1.9} />
        </Item>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => openPublish('post')}
          aria-label="Create"
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-grad text-onbrand shadow-brand"
        >
          <Plus className="h-6 w-6" strokeWidth={2.6} />
        </motion.button>
        <Item tab="reels" label="Reels">
          <Clapperboard className="h-[23px] w-[23px]" strokeWidth={activeTab === 'reels' ? 2.4 : 1.9} />
        </Item>
        <Item tab="profile" label="Profile">
          <Avatar
            src={user?.avatarUrl}
            name={user?.fullName}
            size={26}
            ring={activeTab === 'profile' && !profileUserId ? 'gold' : null}
          />
        </Item>
      </div>
    </nav>
  );
};
