import React, { useMemo } from 'react';
import { Plus } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { useFeedStore } from '../../store/useFeedStore.js';
import { useRequireVerified } from '../../lib/actions.js';
import type { CampusStory } from '../../types/index.js';
import { firstName } from '../../lib/format.js';
import { Avatar } from '../ui/Avatar.js';

export interface StoryGroup {
  userId: string;
  userName: string;
  userAvatar: string;
  stories: CampusStory[];
  allSeen: boolean;
}

/** Group stories per person: yours first, then unseen, then most recent. */
export function groupStories(stories: CampusStory[], myId?: string): StoryGroup[] {
  const map = new Map<string, StoryGroup>();
  for (const s of stories) {
    const g = map.get(s.userId) || { userId: s.userId, userName: s.userName, userAvatar: s.userAvatar, stories: [], allSeen: true };
    g.stories.push(s);
    if (!s.seenByMe && s.userId !== myId) g.allSeen = false;
    map.set(s.userId, g);
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.userId === myId) return -1;
    if (b.userId === myId) return 1;
    if (a.allSeen !== b.allSeen) return a.allSeen ? 1 : -1;
    const la = a.stories[a.stories.length - 1].createdAt;
    const lb = b.stories[b.stories.length - 1].createdAt;
    return lb.localeCompare(la);
  });
}

export const StoriesBar: React.FC = () => {
  const { user } = useAuthStore();
  const { stories, lives } = useFeedStore();
  const { openStories, openPublish, openLiveViewer, openLiveStudio } = useAppStore();
  const requireVerified = useRequireVerified();

  const groups = useMemo(() => groupStories(stories, user?.id), [stories, user?.id]);
  const mine = groups.find((g) => g.userId === user?.id);
  const others = groups.filter((g) => g.userId !== user?.id);

  return (
    <div className="no-scrollbar flex gap-4 overflow-x-auto px-4 py-3">
      {/* Your story */}
      <div className="flex w-[70px] shrink-0 flex-col items-center gap-1.5">
        <div className="relative">
          <Avatar
            src={user?.avatarUrl}
            name={user?.fullName}
            size={64}
            ring={mine ? 'story' : null}
            onClick={() => (mine ? openStories(user!.id) : requireVerified(() => openPublish('story')))}
          />
          <button
            onClick={() => requireVerified(() => openPublish('story'))}
            aria-label="Add to your story"
            className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-brand-grad text-onbrand ring-[3px] ring-bg"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={3} />
          </button>
        </div>
        <span className="w-full truncate text-center text-[11px] font-medium text-ink2">Your story</span>
      </div>

      {/* Live now */}
      {lives.map((l) => (
        <button
          key={l.id}
          onClick={() => (l.host.id === user?.id ? openLiveStudio(l.title) : openLiveViewer(l.id))}
          className="flex w-[70px] shrink-0 flex-col items-center gap-1.5"
        >
          <div className="relative">
            <Avatar src={l.host.avatarUrl} name={l.host.fullName} size={64} ring="live" />
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-md bg-live-grad px-1.5 py-[1px] text-[9px] font-extrabold uppercase tracking-wider text-white ring-2 ring-bg">
              Live
            </span>
          </div>
          <span className="w-full truncate text-center text-[11px] font-medium text-ink">{firstName(l.host.fullName)}</span>
        </button>
      ))}

      {others.map((g) => (
        <button key={g.userId} onClick={() => openStories(g.userId)} className="flex w-[70px] shrink-0 flex-col items-center gap-1.5">
          <Avatar src={g.userAvatar} name={g.userName} size={64} ring={g.allSeen ? 'seen' : 'story'} />
          <span className={`w-full truncate text-center text-[11px] ${g.allSeen ? 'text-ink3' : 'font-medium text-ink'}`}>
            {firstName(g.userName)}
          </span>
        </button>
      ))}
    </div>
  );
};
