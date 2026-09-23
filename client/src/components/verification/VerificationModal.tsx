import React, { useEffect, useRef, useState } from 'react';
import { ShieldCheck, Upload, FileText, Layers, GraduationCap, IdCard, Clock, CheckCircle2, Lock, AlertTriangle } from 'lucide-react';
import { useVerificationStore } from '../../store/useVerificationStore.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { api } from '../../services/api.js';
import { shortCollege, timeAgoLong } from '../../lib/format.js';
import { Sheet } from '../ui/Sheet.js';
import { Button, Progress } from '../ui/primitives.js';

const STUDENT_DOCS = [
  { key: 'fees_receipt' as const, label: 'Fee receipt', icon: FileText },
  { key: 'id_card' as const, label: 'College ID', icon: IdCard },
  { key: 'marksheet' as const, label: 'Marksheet', icon: Layers },
  { key: 'admission_letter' as const, label: 'Admission letter', icon: GraduationCap },
];
const FACULTY_DOCS = [
  { key: 'faculty_id' as const, label: 'Faculty ID card', icon: IdCard },
  { key: 'appointment_letter' as const, label: 'Appointment letter', icon: FileText },
];

export const VerificationModal: React.FC = () => {
  const { isModalOpen, closeModal, selectedDocType, setSelectedDocType, submitDocument, isSubmitting, progress, submitted, error, reset } = useVerificationStore();
  const { user } = useAuthStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ status: string; submittedAt: string; rejectionReason?: string } | null>(null);

  useEffect(() => {
    if (!isModalOpen) return;
    api
      .getVerificationStatus()
      .then((r) => setStatus(r.document))
      .catch(() => setStatus(null));
  }, [isModalOpen, submitted]);

  const isFaculty = user?.role === 'faculty';
  const verified = user?.verificationStatus === 'Verified Member';
  useEffect(() => {
    if (!isModalOpen) return;
    const allowed = (isFaculty ? FACULTY_DOCS : STUDENT_DOCS).map((d) => d.key as string);
    if (!allowed.includes(selectedDocType)) setSelectedDocType(isFaculty ? 'faculty_id' : 'fees_receipt');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModalOpen, isFaculty]);
  const pending = user?.verificationStatus === 'Pending' || submitted;
  const rejected = user?.verificationStatus === 'Rejected';
  const [resubmit, setResubmit] = useState(false);
  useEffect(() => setResubmit(false), [isModalOpen]);

  return (
    <Sheet open={isModalOpen} onClose={closeModal} title={isFaculty ? 'Faculty verification' : 'Student verification'} zIndex={74} maxWidth="sm:max-w-md">
      <div className="space-y-5 px-5 pb-8 pt-4">
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-sunken/60 p-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-grad text-onbrand">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{user?.fullName}</p>
            <p className="truncate text-xs text-brand">{shortCollege(user?.collegeName) || 'Select your college in onboarding first'}</p>
          </div>
        </div>

        {verified ? (
          <div className="space-y-3 py-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-grad text-onbrand shadow-brand">
              <CheckCircle2 className="h-9 w-9" />
            </div>
            <p className="font-display text-2xl font-semibold text-ink">You're verified</p>
            <p className="text-sm text-ink2">Your gold badge is live. You can post, comment, publish reels and go live.</p>
            <Button full onClick={closeModal}>
              Done
            </Button>
          </div>
        ) : pending && !resubmit ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand/15 text-brand">
              <Clock className="h-8 w-8" />
            </div>
            <div>
              <p className="font-display text-2xl font-semibold text-ink">In review</p>
              <p className="mt-1 text-sm text-ink2">
                A reviewer is checking your document{status?.submittedAt ? ` (submitted ${timeAgoLong(status.submittedAt).toLowerCase()})` : ''}. You'll get a notification as soon as it's done — usually within 24 hours.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" full onClick={() => setResubmit(true)}>
                Replace document
              </Button>
              <Button full onClick={closeModal}>
                Keep browsing
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {rejected && status?.rejectionReason && (
              <div className="flex items-start gap-2 rounded-2xl border border-danger/30 bg-danger/10 p-3 text-sm text-ink">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                <span>
                  Previous document was rejected: <strong>{status.rejectionReason}</strong>. Please upload a clearer copy.
                </span>
              </div>
            )}
            <div>
              <p className="label">1 · Choose a document</p>
              <div className="grid grid-cols-2 gap-2">
                {(isFaculty ? FACULTY_DOCS : STUDENT_DOCS).map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => setSelectedDocType(key)}
                    className={`flex items-center gap-2 rounded-2xl border p-3 text-left text-sm font-semibold transition-colors ${
                      selectedDocType === key ? 'border-brand bg-brand/10 text-ink' : 'border-line text-ink2 hover:border-line2'
                    }`}
                  >
                    <Icon className="h-5 w-5 text-brand" /> {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="label">2 · Upload a clear photo or PDF</p>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    reset();
                    submitDocument(f).then(() => setResubmit(false));
                  }
                  e.target.value = '';
                }}
              />
              <button
                disabled={isSubmitting}
                onClick={() => fileRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-3xl border-2 border-dashed border-brand/40 bg-brand/[0.05] px-4 py-8 text-center transition-colors hover:border-brand disabled:opacity-60"
              >
                <Upload className="h-8 w-8 text-brand" />
                <span className="text-sm font-semibold text-ink">{isSubmitting ? 'Uploading securely…' : 'Tap to choose a file'}</span>
                <span className="text-xs text-ink3">JPG, PNG, WebP or PDF · up to 15 MB</span>
              </button>
              {isSubmitting && <Progress value={progress} className="mt-3" />}
            </div>
            {error && <p className="rounded-2xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</p>}
            <p className="flex items-start gap-2 text-xs leading-relaxed text-ink3">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Your document is stored privately and only visible to our review team through expiring links. It is never shown on your profile.
            </p>
          </div>
        )}
      </div>
    </Sheet>
  );
};
