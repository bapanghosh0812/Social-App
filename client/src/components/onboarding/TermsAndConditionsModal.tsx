import React, { useState } from 'react';
import { Download, Lock, UserCheck, Trash2, Camera, ShieldCheck, Scale, FileText, ArrowRight } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore.js';
import { useAppStore } from '../../store/useAppStore.js';
import { Sheet } from '../ui/Sheet.js';
import { Button, Segmented } from '../ui/primitives.js';

type LegalTab = 'terms' | 'privacy' | 'antiragging' | 'verification';

const LEGAL_TEXT = `COLLEGE CAMPUS — TERMS OF SERVICE & STUDENT CODE OF CONDUCT
Governing law: Republic of India

1. ELIGIBILITY
College Campus is a verified academic and social network for students of recognised Indian universities, colleges and schools.

2. AUTHENTIC IDENTITY & PRIMARY COLLEGE LOCK
Accounts must belong to real people. After onboarding, your primary college is locked to prevent impersonation of campus communities.

3. ZERO-TOLERANCE ANTI-RAGGING & ANTI-HARASSMENT (UGC REGULATIONS, 2009)
Cyber-bullying, harassment, hate speech, threats and non-consensual sharing of media are prohibited. Violations lead to removal of content, account termination and, where required, referral to institutions and authorities.

4. VERIFICATION DOCUMENTS & PRIVACY (DPDP ACT, 2023)
Documents you upload for verification are stored privately, viewed only by authorised reviewers through expiring links, and used solely to confirm enrolment.

5. ACCOUNT DELETION
You can delete your account at any time from Settings. Accounts inactive for 30 days are deleted automatically.
`;

export const TermsAndConditionsModal: React.FC = () => {
  const { user, isTermsAccepted, acceptTerms } = useAuthStore();
  const { addToast, isLegalOpen, setLegalOpen } = useAppStore();
  const [tab, setTab] = useState<LegalTab>('terms');
  const [checked, setChecked] = useState(false);

  const gate = Boolean(user && !isTermsAccepted);
  const open = gate || isLegalOpen;

  const download = () => {
    const url = URL.createObjectURL(new Blob([LEGAL_TEXT], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'College_Campus_Terms.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const Article: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
    <div className="space-y-1.5">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <span className="text-brand">{icon}</span>
        {title}
      </h4>
      <p className="text-[13px] leading-relaxed text-ink2">{children}</p>
    </div>
  );

  return (
    <Sheet
      open={open}
      onClose={() => (gate ? undefined : setLegalOpen(false))}
      title="Terms & privacy"
      subtitle="Terms of Service · DPDP Act 2023 · UGC guidelines"
      height="tall"
      zIndex={95}
      headerRight={
        <button onClick={download} aria-label="Download a copy" className="flex h-9 w-9 items-center justify-center rounded-full text-ink2 hover:bg-ink/5">
          <Download className="h-4 w-4" />
        </button>
      }
      footer={
        gate ? (
          <div className="space-y-3">
            <label className="flex cursor-pointer items-start gap-3 text-[13px] text-ink2">
              <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[rgb(var(--brand))]" />
              <span>
                I have read and accept the <strong className="text-ink">Terms of Service</strong>, <strong className="text-ink">Privacy Policy</strong> and{' '}
                <strong className="text-ink">Student Code of Conduct</strong>.
              </span>
            </label>
            <Button
              full
              size="lg"
              disabled={!checked}
              icon={<ArrowRight className="h-4 w-4" />}
              onClick={() => {
                acceptTerms();
                addToast('Welcome to College Campus', 'success');
              }}
            >
              Accept & continue
            </Button>
          </div>
        ) : (
          <Button full variant="secondary" onClick={() => setLegalOpen(false)}>
            Close
          </Button>
        )
      }
    >
      <div className="space-y-5 px-5 py-4">
        <Segmented
          id="legal-tab"
          size="sm"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'terms', label: 'Terms' },
            { value: 'privacy', label: 'Privacy' },
            { value: 'antiragging', label: 'Anti-ragging' },
            { value: 'verification', label: 'Verification' },
          ]}
        />

        {tab === 'terms' && (
          <div className="space-y-4">
            <p className="rounded-2xl border border-brand/25 bg-brand/[0.07] p-4 text-[13px] leading-relaxed text-ink">
              College Campus is a digital home for students, faculty and alumni of recognised Indian institutions. By creating an account you confirm you're enrolled in or affiliated with the college you choose.
            </p>
            <Article icon={<Lock className="h-4 w-4" />} title="Primary college lock">
              To protect campus communities from impersonation, your primary college can't be changed after onboarding.
            </Article>
            <Article icon={<UserCheck className="h-4 w-4" />} title="Authentic identity">
              One account per person, under your real identity. Impersonating students, faculty or officials leads to permanent removal.
            </Article>
            <Article icon={<Trash2 className="h-4 w-4" />} title="Deletion & 30-day inactivity">
              Delete your account anytime from Settings → Delete account (type your email to confirm). Accounts not signed into for 30 consecutive days are deleted automatically with all their data.
            </Article>
            <Article icon={<Camera className="h-4 w-4" />} title="Device permissions">
              Camera, microphone, photos and notifications are requested only when a feature needs them (posting, reels, stories, live, verification) and can be revoked anytime.
            </Article>
          </div>
        )}

        {tab === 'privacy' && (
          <div className="space-y-4">
            <p className="rounded-2xl border border-info/25 bg-info/[0.07] p-4 text-[13px] leading-relaxed text-ink">
              We process personal data under the Digital Personal Data Protection Act, 2023. Your data is never sold.
            </p>
            <Article icon={<ShieldCheck className="h-4 w-4" />} title="How we protect it">
              Passwords are stored only as bcrypt hashes. Data travels over HTTPS. Verification documents live in private storage that only reviewers can open through links that expire in minutes.
            </Article>
            <Article icon={<Lock className="h-4 w-4" />} title="You control visibility">
              A private account hides your posts, reels and stories from anyone you haven't approved. Blocking hides you from each other completely.
            </Article>
            <Article icon={<Lock className="h-4 w-4" />} title="Sessions">
              Sign-in sessions expire after 30 days. You can sign out of every device at once from Settings → Security.
            </Article>
          </div>
        )}

        {tab === 'antiragging' && (
          <div className="space-y-4">
            <p className="rounded-2xl border border-danger/25 bg-danger/[0.07] p-4 text-[13px] leading-relaxed text-ink">
              Ragging in any form — online trolling, humiliating memes, harassment or threats — is prohibited under the UGC Regulations on Curbing the Menace of Ragging, 2009.
            </p>
            <Article icon={<Scale className="h-4 w-4" />} title="Reporting & action">
              Report content or accounts from the ⋯ menu, or file a Harassment ticket in Help & safety. Our team reviews reports within 24 hours and removes violating content. UGC anti-ragging helpline: 1800-180-5522.
            </Article>
          </div>
        )}

        {tab === 'verification' && (
          <div className="space-y-4">
            <p className="rounded-2xl border border-brand/25 bg-brand/[0.07] p-4 text-[13px] leading-relaxed text-ink">
              By uploading a fee receipt, college ID, marksheet or admission letter, you allow our review team to confirm your name, institution and batch to issue your verified badge.
            </p>
            <Article icon={<FileText className="h-4 w-4" />} title="Storage & access">
              Documents are never public and never shown on your profile. Only authorised reviewers can view them, and they are deleted along with your account.
            </Article>
          </div>
        )}
      </div>
    </Sheet>
  );
};
