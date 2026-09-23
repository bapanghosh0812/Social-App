import React, { ReactNode, useEffect, useState } from 'react';
import { Smartphone, Monitor } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore.js';

function useIsDesktop(): boolean {
  const query = '(min-width: 1024px)';
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return matches;
}

/**
 * App shell. Phones: full screen. Desktop: a centered column, or an optional
 * phone-frame preview (toggle bottom-left). The app is always mounted once.
 */
export const DeviceFrame: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isDeviceFrameEnabled, toggleDeviceFrame } = useAppStore();
  const isDesktop = useIsDesktop();
  const framed = isDesktop && isDeviceFrameEnabled;

  return (
    <div className="relative flex min-h-[100dvh] justify-center">
      {isDesktop && (
        <div className="fixed bottom-5 left-5 z-[90] flex items-center gap-1 rounded-full border border-line bg-elev/90 p-1 shadow-lift backdrop-blur">
          <button
            onClick={() => framed && toggleDeviceFrame()}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              !framed ? 'bg-brand-grad text-onbrand' : 'text-ink2 hover:text-ink'
            }`}
          >
            <Monitor className="h-3.5 w-3.5" /> Web
          </button>
          <button
            onClick={() => !framed && toggleDeviceFrame()}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              framed ? 'bg-brand-grad text-onbrand' : 'text-ink2 hover:text-ink'
            }`}
          >
            <Smartphone className="h-3.5 w-3.5" /> Phone
          </button>
        </div>
      )}

      {framed ? (
        <div className="my-6">
          <div className="relative h-[880px] w-[410px] rounded-[56px] border-[10px] border-[#1d1d22] bg-bg shadow-[0_40px_120px_-30px_rgba(0,0,0,0.8)] ring-1 ring-white/10">
            <div className="pointer-events-none absolute left-1/2 top-3 z-[200] h-7 w-28 -translate-x-1/2 rounded-full bg-black" />
            {/* translateZ on a non-scrolling wrapper keeps fixed overlays pinned inside the phone */}
            <div
              className="h-full w-full overflow-hidden rounded-[46px] [transform:translateZ(0)]"
              style={{ ['--app-h' as string]: '860px' }}
            >
              <div id="app-scroll" className="h-full w-full overflow-y-auto overflow-x-hidden no-scrollbar">
                {children}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative min-h-[100dvh] w-full max-w-[480px] lg:border-x lg:border-line">{children}</div>
      )}
    </div>
  );
};
