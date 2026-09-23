import React from 'react';
import { GraduationCap, Presentation, ArrowRight, Check } from 'lucide-react';

export type OnboardingRole = 'student' | 'faculty';

export const RoleSelectionModal: React.FC<{ onSelectRole: (role: OnboardingRole) => void }> = ({ onSelectRole }) => (
  <div className="space-y-5">
    <div className="text-center">
      <h2 className="font-display text-2xl font-semibold text-ink">Who are you on campus?</h2>
      <p className="mt-1 text-sm text-ink2">College Campus connects students and teachers of every college in India.</p>
    </div>
    {[
      {
        role: 'student' as const,
        icon: <GraduationCap className="h-6 w-6" />,
        title: "I'm a student",
        text: 'Join your campus, share posts & reels, follow teachers and classmates, and find internships.',
        perks: ['Campus feed & notices', 'Opportunities & internships'],
      },
      {
        role: 'faculty' as const,
        icon: <Presentation className="h-6 w-6" />,
        title: "I'm a teacher / faculty",
        text: 'Share knowledge, announcements and research, mentor students and connect with educators nationwide.',
        perks: ['Faculty badge', 'Share opportunities with students'],
      },
    ].map((r) => (
      <button key={r.role} onClick={() => onSelectRole(r.role)} className="card group flex w-full items-start gap-4 p-5 text-left transition-colors hover:border-brand/50">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-grad text-onbrand shadow-brand">{r.icon}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between font-display text-lg font-semibold text-ink">
            {r.title} <ArrowRight className="h-4 w-4 text-brand transition-transform group-hover:translate-x-1" />
          </span>
          <span className="mt-1 block text-[13px] leading-relaxed text-ink2">{r.text}</span>
          <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {r.perks.map((p) => (
              <span key={p} className="flex items-center gap-1 text-[11px] font-medium text-ink2">
                <Check className="h-3 w-3 text-success" /> {p}
              </span>
            ))}
          </span>
        </span>
      </button>
    ))}
  </div>
);
