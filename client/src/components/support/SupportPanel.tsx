import React, { useEffect, useState } from 'react';
import { Send, LifeBuoy, ShieldAlert, Phone, ChevronDown } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore.js';
import { api } from '../../services/api.js';
import type { SupportTicket } from '../../types/index.js';
import { timeAgo } from '../../lib/format.js';
import { Button, EmptyState, Segmented } from '../ui/primitives.js';

const CATEGORIES = ['Bug', 'Account', 'Verification', 'Harassment', 'Fraud / Scam Report', 'Feature'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const;

const FAQS = [
  { q: 'How does student verification work?', a: 'Upload your fee receipt, college ID, marksheet or admission letter from Settings → Student verification. A reviewer confirms your name and college, then your account gets the gold verified badge. Your document stays private.' },
  { q: 'Why can’t I post or comment?', a: 'Only verified members can publish, to keep campuses authentic. You can still browse, like, follow and message while your verification is reviewed.' },
  { q: 'Can I change my college?', a: 'No. Your primary college is locked after onboarding to prevent impersonation of campus communities.' },
  { q: 'How do I make my account private?', a: 'Settings → Privacy → Private account. New followers will then need your approval to see your posts, reels and stories.' },
  { q: 'Someone is harassing me — what do I do?', a: 'Use Report and Block from their profile or content. For ragging or threats, also file a Harassment ticket here and contact the UGC anti-ragging helpline 1800-180-5522.' },
  { q: 'How do reels from YouTube or Instagram work?', a: 'Paste the link when creating a reel. It plays inside College Campus, and likes, comments, shares and reshares work just like uploaded reels.' },
];

export const SupportPanel: React.FC = () => {
  const { addToast } = useAppStore();
  const [view, setView] = useState<'new' | 'tickets' | 'faq'>('new');
  const [category, setCategory] = useState('Bug');
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>('Medium');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const load = () => api.getMyTickets().then((r) => setTickets(r.tickets)).catch(() => setTickets([]));
  useEffect(() => {
    load();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.createTicket({ category, subject: subject.trim(), description: description.trim(), priority });
      addToast(`Ticket ${res.ticket.id} submitted`, 'success');
      setSubject('');
      setDescription('');
      setTickets((t) => [res.ticket, ...(t || [])]);
      setView('tickets');
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl border border-danger/25 bg-danger/[0.07] p-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
        <div className="text-xs leading-relaxed text-ink2">
          <strong className="text-ink">In danger or facing ragging?</strong> Call <a className="font-semibold text-brand" href="tel:112">112</a> for emergencies or the UGC anti-ragging helpline{' '}
          <a className="inline-flex items-center gap-0.5 font-semibold text-brand" href="tel:18001805522">
            <Phone className="h-3 w-3" /> 1800-180-5522
          </a>
          .
        </div>
      </div>

      <Segmented
        id="support-view"
        size="sm"
        value={view}
        onChange={setView}
        options={[
          { value: 'new', label: 'Report an issue' },
          { value: 'tickets', label: `My tickets${tickets?.length ? ` (${tickets.length})` : ''}` },
          { value: 'faq', label: 'FAQs' },
        ]}
      />

      {view === 'new' && (
        <form onSubmit={submit} className="space-y-3">
          <div>
            <p className="label">Category</p>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <button type="button" key={c} onClick={() => setCategory(c)} className={`chip ${category === c ? 'chip-active' : ''}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="label">Priority</p>
            <div className="flex gap-1.5">
              {PRIORITIES.map((p) => (
                <button type="button" key={p} onClick={() => setPriority(p)} className={`chip flex-1 justify-center ${priority === p ? 'chip-active' : ''}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <input required value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} placeholder="Subject" className="input" />
          <textarea required value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} rows={5} placeholder="What happened? Steps to reproduce, links, usernames…" className="input resize-none" />
          <Button type="submit" full size="lg" loading={busy} icon={<Send className="h-4 w-4" />}>
            Submit ticket
          </Button>
        </form>
      )}

      {view === 'tickets' &&
        (tickets && tickets.length === 0 ? (
          <EmptyState compact icon={<LifeBuoy className="h-6 w-6" />} title="No tickets yet" subtitle="Anything you report shows up here with replies from our team." />
        ) : (
          <div className="space-y-2.5">
            {(tickets || []).map((t) => (
              <div key={t.id} className="card space-y-1.5 p-4">
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
                <p className="line-clamp-2 text-xs text-ink2">{t.description}</p>
                {t.adminNote && <p className="rounded-xl bg-brand/[0.08] p-2.5 text-xs text-ink"><strong className="text-brand">Support:</strong> {t.adminNote}</p>}
                <p className="text-[11px] text-ink3">
                  {t.category} · {timeAgo(t.createdAt)} ago
                </p>
              </div>
            ))}
          </div>
        ))}

      {view === 'faq' && (
        <div className="card divide-y divide-line overflow-hidden">
          {FAQS.map((f, i) => (
            <div key={f.q}>
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="flex w-full items-center justify-between gap-3 p-4 text-left">
                <span className="text-sm font-semibold text-ink">{f.q}</span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-ink3 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
              </button>
              {openFaq === i && <p className="px-4 pb-4 text-sm leading-relaxed text-ink2">{f.a}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
