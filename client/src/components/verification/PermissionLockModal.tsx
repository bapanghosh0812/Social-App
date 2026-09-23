import React from 'react';
import { BadgeCheck, Clock, PenLine, Radio, MessageCircle, Clapperboard } from 'lucide-react';
import { useVerificationStore } from '../../store/useVerificationStore.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { Sheet } from '../ui/Sheet.js';
import { Button } from '../ui/primitives.js';

/** Shown when an unverified account tries to publish or comment. */
export const PermissionLockModal: React.FC = () => {
  const { isPermissionLockModalOpen, closePermissionLockModal, openModal } = useVerificationStore();
  const { user } = useAuthStore();
  const pending = user?.verificationStatus === 'Pending';

  return (
    <Sheet open={isPermissionLockModalOpen} onClose={closePermissionLockModal} zIndex={76} maxWidth="sm:max-w-sm">
      <div className="space-y-5 px-6 pb-8 pt-4 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-brand-grad text-onbrand shadow-brand">
          {pending ? <Clock className="h-8 w-8" /> : <BadgeCheck className="h-8 w-8" />}
        </div>
        <div>
          <h3 className="font-display text-2xl font-semibold text-ink">{pending ? 'Almost there' : 'Verified members only'}</h3>
          <p className="mt-2 text-sm leading-relaxed text-ink2">
            {pending
              ? 'Your document is being reviewed. You can browse, like, follow and message while you wait.'
              : 'To keep campuses safe and authentic, only verified students can post and comment. It takes a minute to submit.'}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-left text-xs text-ink2">
          {[
            { icon: <PenLine className="h-4 w-4" />, label: 'Post & comment' },
            { icon: <Clapperboard className="h-4 w-4" />, label: 'Publish reels' },
            { icon: <Radio className="h-4 w-4" />, label: 'Go live' },
            { icon: <MessageCircle className="h-4 w-4" />, label: 'Gold badge' },
          ].map((f) => (
            <div key={f.label} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
              <span className="text-brand">{f.icon}</span> {f.label}
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <Button
            full
            size="lg"
            onClick={() => {
              closePermissionLockModal();
              openModal();
            }}
          >
            {pending ? 'View status' : 'Get verified'}
          </Button>
          <Button variant="ghost" full onClick={closePermissionLockModal}>
            Not now
          </Button>
        </div>
      </div>
    </Sheet>
  );
};
