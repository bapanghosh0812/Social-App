import React from 'react';
import { Bell, Send } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore.js';
import { useInboxStore } from '../../store/useInboxStore.js';
import { IconButton } from '../ui/primitives.js';
import { BrandMark } from '../brand/Logo.js';
import { isPreview } from '../../services/api.js';

/** Home/Explore header: logo, activity and messages. Settings live on the profile. */
export const TopHeader: React.FC = () => {
  const { activeTab, setActiveTab } = useAppStore();
  const { unreadNotifications, unreadMessages } = useInboxStore();

  return (
    <header className="glass sticky top-0 z-40 border-b border-line safe-top">
      <div className="flex h-14 items-center justify-between px-4">
        <button onClick={() => setActiveTab('home')} aria-label="Home" className="flex items-center gap-2">
          <BrandMark />
          {isPreview() && (
            <span title="Sample data — changes reset when you reload" className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold2">
              Demo
            </span>
          )}
        </button>
        <div className="flex items-center gap-0.5">
          <IconButton
            label="Activity"
            badge={unreadNotifications}
            onClick={() => setActiveTab('notifications')}
            className={activeTab === 'notifications' ? 'text-brand' : ''}
          >
            <Bell className="h-[21px] w-[21px]" />
          </IconButton>
          <IconButton
            label="Messages"
            badge={unreadMessages}
            onClick={() => setActiveTab('messages')}
            className={activeTab === 'messages' ? 'text-brand' : ''}
          >
            <Send className="h-[20px] w-[20px] -rotate-12" />
          </IconButton>
        </div>
      </div>
    </header>
  );
};
