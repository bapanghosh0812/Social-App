import React, { useEffect, useState } from 'react';
import { ChevronRight, ShieldCheck, Ban } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore.js';
import { api } from '../../services/api.js';
import { Sheet } from '../ui/Sheet.js';
import { Button } from '../ui/primitives.js';

const FALLBACK_REASONS = ['Spam', 'Harassment or bullying', 'Ragging', 'Hate speech', 'Nudity or sexual content', 'Violence', 'Fake account', 'Scam or fraud', 'Misinformation', 'Other'];

export const ReportSheet: React.FC = () => {
  const { report, closeReport, addToast } = useAppStore();
  const [reasons, setReasons] = useState<string[]>(FALLBACK_REASONS);
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!report) return;
    setReason(null);
    setDetails('');
    setDone(false);
    api.getReportReasons().then((r) => setReasons(r.reasons)).catch(() => {});
  }, [report?.targetId]);

  const submit = async () => {
    if (!report || !reason) return;
    setBusy(true);
    try {
      await api.report({ targetType: report.targetType, targetId: report.targetId, parentId: report.parentId, reason, details: details.trim() });
      setDone(true);
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const block = async () => {
    if (!report?.ownerId) return;
    try {
      const res = await api.block(report.ownerId);
      addToast(res.message, 'success');
      window.dispatchEvent(new Event('cc:blocked'));
      closeReport();
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  const noun = report?.targetType === 'user' ? 'account' : report?.targetType;

  return (
    <Sheet open={Boolean(report)} onClose={closeReport} title={done ? 'Thanks for letting us know' : `Report ${noun ?? ''}`} zIndex={75} maxWidth="sm:max-w-md">
      {done ? (
        <div className="space-y-5 px-6 pb-6 pt-4 text-center safe-bottom">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/15 text-success">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <p className="text-sm leading-relaxed text-ink2">
            Your report is anonymous. Our safety team reviews reports within 24 hours and removes anything that breaks our community guidelines.
          </p>
          {report?.ownerId && (
            <Button variant="danger" full onClick={block} icon={<Ban className="h-4 w-4" />}>
              Block {report.ownerName || 'this account'}
            </Button>
          )}
          <Button variant="secondary" full onClick={closeReport}>
            Done
          </Button>
        </div>
      ) : !reason ? (
        <div className="p-2 pb-4 safe-bottom">
          <p className="px-4 pb-2 pt-1 text-sm text-ink2">Why are you reporting this? Your report is anonymous.</p>
          {reasons.map((r) => (
            <button
              key={r}
              onClick={() => setReason(r)}
              className="flex w-full items-center justify-between rounded-2xl px-4 py-3.5 text-left text-[15px] text-ink transition-colors hover:bg-ink/5"
            >
              {r}
              <ChevronRight className="h-4 w-4 text-ink3" />
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-4 px-5 pb-6 pt-4 safe-bottom">
          <div className="rounded-2xl border border-line bg-sunken/60 px-4 py-3 text-sm">
            <span className="text-ink3">Reason:</span> <span className="font-semibold text-ink">{reason}</span>
            <button onClick={() => setReason(null)} className="ml-2 text-xs font-semibold text-brand">
              Change
            </button>
          </div>
          <div>
            <label className="label">Anything else? (optional)</label>
            <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} maxLength={1000} className="input resize-none" placeholder="Add details that help our team review this faster" />
          </div>
          <Button full size="lg" loading={busy} onClick={submit}>
            Submit report
          </Button>
        </div>
      )}
    </Sheet>
  );
};
