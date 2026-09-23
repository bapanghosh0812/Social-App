import React, { useEffect, useState } from 'react';
import { ShieldCheck, Flag, LifeBuoy, KeyRound, RefreshCw, CheckCircle2, XCircle, ExternalLink, Inbox, FileText, Trash2, LayoutDashboard, Lock } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore.js';
import { api, mediaUrl } from '../../services/api.js';
import { realtime } from '../../services/realtime.js';
import type { Report, SupportTicket, VerificationDocument } from '../../types/index.js';
import { timeAgo } from '../../lib/format.js';
import { Sheet } from '../ui/Sheet.js';
import { Avatar } from '../ui/Avatar.js';
import { Button, EmptyState, Segmented, Spinner } from '../ui/primitives.js';

type Tab = 'overview' | 'verify' | 'reports' | 'tickets' | 'security';

export const AdminDashboardModal: React.FC = () => {
  const { isAdminConsoleOpen, setAdminConsoleOpen, adminPin, setAdminPin, addToast } = useAppStore();
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [docs, setDocs] = useState<VerificationDocument[] | null>(null);
  const [reports, setReports] = useState<Report[] | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [loading, setLoading] = useState(false);

  const pin = adminPin || '';

  const handleError = (err: any) => {
    addToast(err.message, 'error');
    if (err.status === 403 || err.status === 429) {
      setAdminPin(null);
      setAdminConsoleOpen(false);
    }
  };

  const refresh = async () => {
    if (!pin) return;
    setLoading(true);
    try {
      const [s, d, r, t] = await Promise.all([api.adminStats(pin), api.adminVerifications(pin), api.adminReports(pin), api.adminTickets(pin)]);
      setStats(s.stats);
      setDocs(d.documents);
      setReports(r.reports);
      setTickets(t.tickets);
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdminConsoleOpen || !pin) return;
    refresh();
    realtime.send({ type: 'ADMIN_AUTH', pin });
    const offs = [
      realtime.on('NEW_PENDING_DOCUMENT', (m) => {
        addToast(`New verification from ${m.payload.userName}`, 'info');
        refresh();
      }),
      realtime.on('NEW_REPORT', () => {
        addToast('New safety report received', 'info');
        refresh();
      }),
    ];
    return () => offs.forEach((o) => o());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdminConsoleOpen, pin]);

  const close = () => setAdminConsoleOpen(false);

  return (
    <Sheet
      open={isAdminConsoleOpen}
      onClose={close}
      title="Admin console"
      subtitle="Verification, moderation & support"
      height="full"
      maxWidth="sm:max-w-3xl"
      zIndex={88}
      headerRight={
        <button onClick={refresh} aria-label="Refresh" className="flex h-9 w-9 items-center justify-center rounded-full text-ink2 hover:bg-ink/5">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      }
    >
      <div className="space-y-4 p-4 pb-10">
        <Segmented
          id="admin-tab"
          size="sm"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'overview', label: 'Overview', icon: <LayoutDashboard className="h-3.5 w-3.5" /> },
            { value: 'verify', label: `Verify${docs?.length ? ` (${docs.length})` : ''}`, icon: <ShieldCheck className="h-3.5 w-3.5" /> },
            { value: 'reports', label: `Reports${reports?.length ? ` (${reports.length})` : ''}`, icon: <Flag className="h-3.5 w-3.5" /> },
            { value: 'tickets', label: 'Tickets', icon: <LifeBuoy className="h-3.5 w-3.5" /> },
            { value: 'security', label: 'PIN', icon: <KeyRound className="h-3.5 w-3.5" /> },
          ]}
        />

        {tab === 'overview' &&
          (!stats ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['Users', stats.users],
                ['Verified', stats.verifiedMembers],
                ['Posts', stats.posts],
                ['Reels', stats.reels],
                ['Pending verifications', stats.pendingVerifications],
                ['Open reports', stats.openReports],
                ['Open tickets', stats.openTickets],
              ].map(([label, value]) => (
                <div key={label as string} className="card p-4">
                  <p className="font-display text-3xl font-semibold text-ink">{value as number}</p>
                  <p className="text-xs text-ink3">{label}</p>
                </div>
              ))}
            </div>
          ))}

        {tab === 'verify' && <Verifications docs={docs} pin={pin} onDone={refresh} onError={handleError} />}
        {tab === 'reports' && <Reports reports={reports} pin={pin} onDone={refresh} onError={handleError} />}
        {tab === 'tickets' && <Tickets tickets={tickets} pin={pin} onDone={refresh} onError={handleError} />}
        {tab === 'security' && <ChangePin pin={pin} />}
      </div>
    </Sheet>
  );
};

const Verifications: React.FC<{ docs: VerificationDocument[] | null; pin: string; onDone: () => void; onError: (e: any) => void }> = ({ docs, pin, onDone, onError }) => {
  const { addToast } = useAppStore();
  const [reason, setReason] = useState<Record<string, string>>({});
  if (!docs) return <Spinner />;
  if (!docs.length) return <EmptyState icon={<Inbox className="h-6 w-6" />} title="Queue is clear" subtitle="New student verification submissions will appear here in real time." />;
  return (
    <div className="space-y-3">
      {docs.map((d) => (
        <div key={d.id} className="card space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base font-semibold text-ink">{d.userName}</p>
              <p className="truncate text-xs text-brand">{d.collegeName}</p>
              <p className="truncate text-xs text-ink3">
                {d.userEmail} · {timeAgo(d.submittedAt)} ago
              </p>
            </div>
            <span className="shrink-0 rounded-lg bg-brand/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-brand">{d.documentType.replace('_', ' ')}</span>
          </div>
          {d.documentViewUrl &&
            (d.isPdf ? (
              <a href={mediaUrl(d.documentViewUrl)} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl border border-line bg-sunken p-4 hover:border-brand/40">
                <FileText className="h-8 w-8 text-brand" />
                <span className="flex-1 text-sm font-semibold text-ink">Open PDF document</span>
                <ExternalLink className="h-4 w-4 text-ink3" />
              </a>
            ) : (
              <a href={mediaUrl(d.documentViewUrl)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl border border-line bg-sunken">
                <img src={mediaUrl(d.documentViewUrl)} alt="Submitted document" className="max-h-80 w-full object-contain" />
              </a>
            ))}
          <p className="flex items-center gap-1.5 text-[11px] text-ink3">
            <Lock className="h-3 w-3" /> Private file · link expires in 10 minutes
          </p>
          <input
            value={reason[d.id] || ''}
            onChange={(e) => setReason((r) => ({ ...r, [d.id]: e.target.value }))}
            placeholder="Reason if rejecting (sent to the student)"
            className="input"
          />
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="danger"
              icon={<XCircle className="h-4 w-4" />}
              onClick={async () => {
                try {
                  await api.adminReject(d.id, reason[d.id] || '', pin);
                  addToast('Rejected — student notified', 'success');
                  onDone();
                } catch (e) {
                  onError(e);
                }
              }}
            >
              Reject
            </Button>
            <Button
              icon={<CheckCircle2 className="h-4 w-4" />}
              onClick={async () => {
                try {
                  await api.adminApprove(d.id, pin);
                  addToast('Approved — student is now verified', 'success');
                  onDone();
                } catch (e) {
                  onError(e);
                }
              }}
            >
              Approve
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};

const Reports: React.FC<{ reports: Report[] | null; pin: string; onDone: () => void; onError: (e: any) => void }> = ({ reports, pin, onDone, onError }) => {
  const { addToast, openPost, openReels, openProfile, setAdminConsoleOpen } = useAppStore();
  if (!reports) return <Spinner />;
  if (!reports.length) return <EmptyState icon={<Flag className="h-6 w-6" />} title="No open reports" subtitle="Reports from the community appear here." />;
  const act = async (r: Report, action: 'remove' | 'dismiss') => {
    try {
      await api.adminReportAction(r.id, action, pin);
      addToast(action === 'remove' ? 'Content removed and owner notified' : 'Report dismissed', 'success');
      onDone();
    } catch (e) {
      onError(e);
    }
  };
  const view = (r: Report) => {
    setAdminConsoleOpen(false);
    if (r.targetType === 'post') openPost(r.targetId);
    else if (r.targetType === 'reel') openReels({ startId: r.targetId });
    else if (r.targetType === 'user') openProfile(r.targetId);
    else if (r.parentId) openPost(r.parentId);
  };
  return (
    <div className="space-y-3">
      {reports.map((r) => (
        <div key={r.id} className="card space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="rounded-lg bg-danger/10 px-2 py-1 text-[11px] font-bold text-danger">{r.reason}</span>
            <span className="text-xs text-ink3">
              {r.targetType} · {timeAgo(r.createdAt)} ago
            </span>
          </div>
          {r.owner && (
            <div className="flex items-center gap-2">
              <Avatar src={r.owner.avatarUrl} name={r.owner.fullName} size={28} />
              <span className="text-sm font-semibold text-ink">{r.owner.fullName}</span>
            </div>
          )}
          <p className="rounded-2xl bg-sunken p-3 text-sm text-ink2">“{r.snapshot}”</p>
          {r.details && <p className="text-xs text-ink3">Reporter note: {r.details}</p>}
          <p className="text-[11px] text-ink3">Reported by {r.reporterName}</p>
          <div className="grid grid-cols-3 gap-2">
            <Button variant="secondary" size="sm" onClick={() => view(r)}>
              View
            </Button>
            <Button variant="secondary" size="sm" onClick={() => act(r, 'dismiss')}>
              Dismiss
            </Button>
            <Button variant="danger" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => act(r, 'remove')}>
              Remove
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};

const Tickets: React.FC<{ tickets: SupportTicket[] | null; pin: string; onDone: () => void; onError: (e: any) => void }> = ({ tickets, pin, onDone, onError }) => {
  const { addToast } = useAppStore();
  const [notes, setNotes] = useState<Record<string, string>>({});
  if (!tickets) return <Spinner />;
  if (!tickets.length) return <EmptyState icon={<LifeBuoy className="h-6 w-6" />} title="No tickets" subtitle="Support requests from users appear here." />;
  const update = async (t: SupportTicket, status: string) => {
    try {
      await api.adminUpdateTicket(t.id, { status, adminNote: notes[t.id] ?? t.adminNote }, pin);
      addToast(`Ticket ${t.id} → ${status}`, 'success');
      onDone();
    } catch (e) {
      onError(e);
    }
  };
  return (
    <div className="space-y-3">
      {tickets.map((t) => (
        <div key={t.id} className="card space-y-2.5 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs font-bold text-brand">{t.id}</span>
            <span
              className={`rounded-lg px-2 py-0.5 text-[11px] font-bold ${
                t.status === 'Resolved' ? 'bg-success/10 text-success' : t.status === 'Investigating' ? 'bg-info/10 text-info' : 'bg-brand/10 text-brand'
              }`}
            >
              {t.status}
            </span>
          </div>
          <p className="text-sm font-semibold text-ink">{t.subject}</p>
          <p className="text-sm text-ink2">{t.description}</p>
          <p className="text-[11px] text-ink3">
            {t.userName} · {t.userEmail} · {t.category} · {t.priority} · {timeAgo(t.createdAt)} ago
          </p>
          <input
            value={notes[t.id] ?? t.adminNote ?? ''}
            onChange={(e) => setNotes((n) => ({ ...n, [t.id]: e.target.value }))}
            placeholder="Reply to the user (optional)"
            className="input"
          />
          <div className="grid grid-cols-3 gap-2">
            {['Open', 'Investigating', 'Resolved'].map((s) => (
              <Button key={s} size="sm" variant={t.status === s ? 'primary' : 'secondary'} onClick={() => update(t, s)}>
                {s}
              </Button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

const ChangePin: React.FC<{ pin: string }> = ({ pin }) => {
  const { addToast, setAdminPin } = useAppStore();
  const [form, setForm] = useState({ oldPin: '', ownerSecret: '', newPin: '', confirmNewPin: '' });
  const [busy, setBusy] = useState(false);
  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6);
  return (
    <form
      className="card space-y-3 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api.adminChangePin(form, pin);
          setAdminPin(form.newPin);
          addToast('Admin PIN updated', 'success');
          setForm({ oldPin: '', ownerSecret: '', newPin: '', confirmNewPin: '' });
        } catch (err: any) {
          addToast(err.message, 'error');
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="text-sm text-ink2">Rotating the PIN needs the current PIN and the owner secret configured on the server (OWNER_SECRET).</p>
      <input type="password" inputMode="numeric" placeholder="Current PIN" value={form.oldPin} onChange={(e) => setForm({ ...form, oldPin: digits(e.target.value) })} className="input" />
      <input type="password" placeholder="Owner secret" value={form.ownerSecret} onChange={(e) => setForm({ ...form, ownerSecret: e.target.value })} className="input" autoComplete="off" />
      <div className="grid grid-cols-2 gap-2">
        <input type="password" inputMode="numeric" placeholder="New PIN" value={form.newPin} onChange={(e) => setForm({ ...form, newPin: digits(e.target.value) })} className="input" />
        <input type="password" inputMode="numeric" placeholder="Confirm" value={form.confirmNewPin} onChange={(e) => setForm({ ...form, confirmNewPin: digits(e.target.value) })} className="input" />
      </div>
      <Button type="submit" full loading={busy} disabled={form.oldPin.length !== 6 || form.newPin.length !== 6 || form.newPin !== form.confirmNewPin || !form.ownerSecret}>
        Update PIN
      </Button>
    </form>
  );
};
