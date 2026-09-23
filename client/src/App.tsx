import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuthStore } from './store/useAuthStore.js';
import { useFeedStore } from './store/useFeedStore.js';
import { useAppStore } from './store/useAppStore.js';
import { useInboxStore } from './store/useInboxStore.js';
import { realtime } from './services/realtime.js';

import { DeviceFrame } from './components/common/DeviceFrame.js';
import { ErrorBoundary } from './components/common/ErrorBoundary.js';
import { TopHeader } from './components/layout/TopHeader.js';
import { LogoEmblem, SplashScreen } from './components/brand/Logo.js';
import { BottomNav } from './components/layout/BottomNav.js';
import { Toaster } from './components/ui/misc.js';
import { Spinner } from './components/ui/primitives.js';

import { LoginScreen } from './components/onboarding/LoginScreen.js';
import { TermsAndConditionsModal } from './components/onboarding/TermsAndConditionsModal.js';
import { OnboardingForm } from './components/onboarding/OnboardingForm.js';

import { HomeFeed } from './components/feed/HomeFeed.js';
import { ReelsFeed, ReelsViewer } from './components/reels/ReelsFeed.js';
import { ExploreView } from './components/search/ExploreView.js';
import { CollegeHubView } from './components/college/CollegeHubView.js';
import { UserProfileView } from './components/profile/UserProfileView.js';
import { MessagesView } from './components/chat/MessagesView.js';
import { NotificationsView } from './components/notifications/NotificationsView.js';

import { CommentsSheet } from './components/feed/CommentsSheet.js';
import { PostDetailModal } from './components/feed/PostDetailModal.js';
import { StoryViewer } from './components/feed/StoryViewer.js';
import { ShareSheet } from './components/share/ShareSheet.js';
import { ReportSheet } from './components/share/ReportSheet.js';
import { UserListSheet } from './components/profile/UserListSheet.js';
import { PublishHubModal } from './components/publish/PublishHubModal.js';
import { LiveStudio } from './components/live/LiveStudio.js';
import { LiveViewer } from './components/live/LiveViewer.js';
import { ProfileSettingsModal } from './components/profile/ProfileSettingsModal.js';
import { HelpSupportModal } from './components/support/HelpSupportModal.js';
import { VerificationModal } from './components/verification/VerificationModal.js';
import { PermissionLockModal } from './components/verification/PermissionLockModal.js';
import { AdminAuthModal } from './components/admin/AdminAuthModal.js';
import { AdminDashboardModal } from './components/admin/AdminDashboardModal.js';

/** Bridges realtime events into stores, toasts and system notifications. */
function useRealtimeBridge(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const app = useAppStore.getState;
    const inbox = useInboxStore.getState;

    const systemNotify = (title: string, body: string) => {
      const user = useAuthStore.getState().user;
      if (!document.hidden || !user?.globalNotificationsEnabled) return;
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      try {
        new Notification(title, { body, icon: '/logo.png', tag: 'college-campus' });
      } catch {
        /* unsupported (some mobile browsers) */
      }
    };

    const offs = [
      realtime.on('READY', () => inbox().refreshCounts()),
      realtime.on('NOTIFICATION', (m) => {
        const n = m.notification;
        if (app().activeTab !== 'notifications') {
          inbox().setUnreadNotifications(m.unreadCount);
          app().addToast(n.message, 'info', { label: 'View', run: () => app().setActiveTab('notifications') });
        }
        if (n.type === 'live') useFeedStore.getState().fetchLives();
        systemNotify(n.title, n.message);
      }),
      realtime.on('MESSAGE_NEW', (m) => {
        const me = useAuthStore.getState().user?.id;
        if (m.message.senderId === me) return;
        inbox().refreshCounts();
        if (app().activeTab !== 'messages') {
          const name = m.from?.fullName || 'Someone';
          const text = m.message.body || `shared a ${m.message.attachment?.type || 'message'}`;
          app().addToast(`${name}: ${text}`, 'info', { label: 'Reply', run: () => app().openChatWith(m.message.senderId) });
          systemNotify(name, text);
        }
      }),
      realtime.on('VERIFICATION_STATUS_UPDATED', (m) => {
        useAuthStore.getState().updateLocalUser({ verificationStatus: m.payload.status });
        app().addToast(m.payload.message, m.payload.status === 'Verified Member' ? 'success' : 'error');
      }),
      realtime.on('BLOCKS_CHANGED', () => useFeedStore.getState().fetchFeed(true)),
    ];
    return () => offs.forEach((off) => off());
  }, [enabled]);
}

/** Open shared links: /?post=… /?reel=… /?user=… /?live=… */
function useDeepLinks(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const params = new URLSearchParams(window.location.search);
    const s = useAppStore.getState();
    const post = params.get('post');
    const reel = params.get('reel');
    const user = params.get('user');
    const live = params.get('live');
    if (post) s.openPost(post);
    else if (reel) s.openReels({ startId: reel });
    else if (user) s.openProfile(user);
    else if (live) s.openLiveViewer(live);
    if (post || reel || user || live) window.history.replaceState({}, '', window.location.pathname);
  }, [enabled]);
}

export const App: React.FC = () => {
  const { user, isLoading, bootstrap } = useAuthStore();
  const { activeTab, collegeId } = useAppStore();
  const { fetchFeed, fetchStories, fetchLives } = useFeedStore();
  const refreshCounts = useInboxStore((s) => s.refreshCounts);
  const signedIn = Boolean(user);
  const ready = signedIn && user!.isProfileComplete;
  const [splash, setSplash] = useState(true);
  const endSplash = useCallback(() => setSplash(false), []);

  useEffect(() => {
    bootstrap();
  }, []);

  useEffect(() => {
    if (!ready) return;
    fetchFeed(true);
    fetchStories();
    fetchLives();
    refreshCounts();
    const t = setInterval(() => {
      fetchLives();
      fetchStories();
    }, 45_000);
    return () => clearInterval(t);
  }, [ready, user?.id]);

  useRealtimeBridge(signedIn);
  useDeepLinks(ready);

  const showHeader = activeTab === 'home' || (activeTab === 'explore' && !collegeId);

  return (
    <ErrorBoundary>
      <DeviceFrame>
        <AnimatePresence>{splash && <SplashScreen onDone={endSplash} />}</AnimatePresence>
        {isLoading ? (
          <div className="flex min-h-[var(--app-h)] flex-col items-center justify-center gap-5">
            <LogoEmblem size={84} />
            <Spinner size={22} />
          </div>
        ) : !user ? (
          <LoginScreen />
        ) : (
          <>
            {showHeader && <TopHeader />}
            <AnimatePresence mode="wait" initial={false}>
              <motion.main
                key={`${activeTab}-${collegeId || ''}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="min-h-[var(--app-h)]"
              >
                {activeTab === 'home' && <HomeFeed />}
                {activeTab === 'explore' && (collegeId ? <CollegeHubView /> : <ExploreView />)}
                {activeTab === 'reels' && <ReelsFeed />}
                {activeTab === 'profile' && <UserProfileView />}
                {activeTab === 'messages' && <MessagesView />}
                {activeTab === 'notifications' && <NotificationsView />}
              </motion.main>
            </AnimatePresence>
            {activeTab !== 'messages' && <BottomNav />}

            {/* Overlays */}
            <CommentsSheet />
            <ShareSheet />
            <ReportSheet />
            <UserListSheet />
            <PostDetailModal />
            <ReelsViewer />
            <StoryViewer />
            <PublishHubModal />
            <LiveStudio />
            <LiveViewer />
            <ProfileSettingsModal />
            <HelpSupportModal />
            <VerificationModal />
            <PermissionLockModal />
            <AdminAuthModal />
            <AdminDashboardModal />
            <OnboardingForm />
          </>
        )}
        <TermsAndConditionsModal />
        <Toaster />
      </DeviceFrame>
    </ErrorBoundary>
  );
};

export default App;
