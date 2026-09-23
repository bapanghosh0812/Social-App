import React, { useEffect, useState } from 'react';
import { Briefcase, MapPin, Users, Search, BadgeCheck, CheckCircle2, Plus, Trash2, CalendarClock, ShieldCheck } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { api } from '../../services/api.js';
import { toggleFollowUser } from '../../lib/actions.js';
import type { JobPosting, MiniUser } from '../../types/index.js';
import { compact, timeAgo } from '../../lib/format.js';
import { Avatar } from '../ui/Avatar.js';
import { Button, EmptyState, SectionTitle, Segmented, Skeleton } from '../ui/primitives.js';
import { Sheet, ConfirmDialog } from '../ui/Sheet.js';
import { VerifiedBadge } from '../ui/misc.js';
import { FollowPill } from '../profile/UserListSheet.js';

export const CampusNetworkHub: React.FC = () => {
  const [tab, setTab] = useState<'jobs' | 'people'>('jobs');
  return (
    <div className="space-y-4 px-4">
      <Segmented
        id="careers-tab"
        size="sm"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'jobs', label: 'Opportunities', icon: <Briefcase className="h-3.5 w-3.5" /> },
          { value: 'people', label: 'People', icon: <Users className="h-3.5 w-3.5" /> },
        ]}
      />
      {tab === 'jobs' ? <JobsList /> : <PeopleSuggestions />}
    </div>
  );
};

const PeopleSuggestions: React.FC = () => {
  const openProfile = useAppStore((s) => s.openProfile);
  const [people, setPeople] = useState<MiniUser[] | null>(null);
  useEffect(() => {
    api.getSuggestions().then((r) => setPeople(r.suggestions)).catch(() => setPeople([]));
  }, []);
  if (people === null) return <ListSkeleton />;
  if (!people.length) return <EmptyState icon={<Users className="h-6 w-6" />} title="No suggestions yet" subtitle="As more verified students join, we'll suggest people to connect with." />;
  return (
    <div className="card divide-y divide-line">
      {people.map((u) => (
        <div key={u.id} className="flex items-center gap-3 p-3">
          <Avatar src={u.avatarUrl} name={u.fullName} size={48} onClick={() => openProfile(u.id)} />
          <button onClick={() => openProfile(u.id)} className="min-w-0 flex-1 text-left">
            <span className="flex items-center gap-1">
              <span className="truncate text-sm font-semibold text-ink">{u.fullName}</span>
              <VerifiedBadge status={u.verificationStatus} size={13} />
            </span>
            <span className="block truncate text-xs text-ink3">
              {u.headline || u.collegeName}
            </span>
          </button>
          <FollowPill
            status={u.followStatus}
            onClick={async () => {
              const next = await toggleFollowUser(u.id, u.followStatus, u.fullName);
              setPeople((l) => l?.map((x) => (x.id === u.id ? { ...x, followStatus: next } : x)) || null);
            }}
          />
        </div>
      ))}
    </div>
  );
};

/** Placements list — used on Careers and inside college hubs. */
export const JobsList: React.FC = () => {
  const { addToast } = useAppStore();
  const { user } = useAuthStore();
  const [jobs, setJobs] = useState<JobPosting[] | null>(null);
  const [type, setType] = useState('All');
  const [search, setSearch] = useState('');
  const [mine, setMine] = useState(false);
  const [posting, setPosting] = useState(false);
  const [removing, setRemoving] = useState<JobPosting | null>(null);
  const canPost = user?.role === 'recruiter' || user?.isAdmin || (user?.role === 'faculty' && user?.verificationStatus === 'Verified Member');

  const load = () =>
    api
      .getJobs({ type, search: search.trim() || undefined, mine })
      .then((r) => setJobs(r.jobs))
      .catch(() => setJobs([]));

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, search, mine]);

  const apply = async (job: JobPosting) => {
    try {
      const res = await api.applyJob(job.id);
      setJobs((l) => l?.map((j) => (j.id === job.id ? { ...j, hasApplied: true, applicationCount: res.applicationCount } : j)) || null);
      addToast('Application recorded — opening your email to send it', 'success');
      window.location.href = res.mailto;
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2.5 rounded-2xl border border-brand/25 bg-brand/[0.07] p-3 text-xs leading-relaxed text-ink2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
        <span>
          <strong className="text-ink">Student-safe hiring.</strong> Recruiters apply from official company domains, salaries are mandatory and unpaid commercial internships are blocked.
        </span>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink3" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search roles, companies, skills" className="input pl-10" />
      </div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto">
        {['All', 'Internship', 'Full-Time', 'Non-Profit'].map((t) => (
          <button key={t} onClick={() => setType(t)} className={`chip shrink-0 ${type === t ? 'chip-active' : ''}`}>
            {t}
          </button>
        ))}
        {canPost && (
          <button onClick={() => setMine((m) => !m)} className={`chip shrink-0 ${mine ? 'chip-active' : ''}`}>
            My postings
          </button>
        )}
      </div>

      {canPost && (
        <Button variant="outline" full onClick={() => setPosting(true)} icon={<Plus className="h-4 w-4" />}>
          Share an opportunity
        </Button>
      )}

      {jobs === null ? (
        <ListSkeleton />
      ) : jobs.length === 0 ? (
        <EmptyState icon={<Briefcase className="h-6 w-6" />} title="No openings found" subtitle="Verified recruiter opportunities will appear here." />
      ) : (
        jobs.map((job) => (
          <article key={job.id} className="card space-y-3 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand/10 font-display text-lg font-bold text-brand">
                {job.companyName.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-[15px] font-semibold leading-snug text-ink">{job.jobTitle}</h4>
                <p className="mt-0.5 flex items-center gap-1 text-[13px] text-ink2">
                  {job.companyName}
                  {job.isCorporateVerified && <BadgeCheck className="h-4 w-4 fill-gold text-white" />}
                </p>
              </div>
              {job.isMine && (
                <button onClick={() => setRemoving(job)} aria-label="Remove posting" className="text-ink3 hover:text-danger">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <span className="rounded-lg bg-success/10 px-2 py-1 font-bold text-success">{job.salaryBracket}</span>
              <span className="rounded-lg bg-ink/5 px-2 py-1 font-semibold text-ink2">{job.jobType}</span>
              <span className="flex items-center gap-1 rounded-lg bg-ink/5 px-2 py-1 font-semibold text-ink2">
                <MapPin className="h-3 w-3" /> {job.location}
              </span>
              {job.deadline && (
                <span className="flex items-center gap-1 rounded-lg bg-ink/5 px-2 py-1 font-semibold text-ink2">
                  <CalendarClock className="h-3 w-3" /> Apply by {new Date(job.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </span>
              )}
            </div>
            <p className="text-[13px] leading-relaxed text-ink2">{job.detailedRequirements}</p>
            {job.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {job.tags.map((t) => (
                  <span key={t} className="rounded-full border border-line px-2.5 py-0.5 text-[11px] text-ink2">
                    {t}
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
              <span className="text-[11px] text-ink3">
                🎓 {job.eligibleBatches} · {compact(job.applicationCount)} applied · {timeAgo(job.createdAt)}
              </span>
              {job.isMine ? (
                <span className="text-xs font-semibold text-ink2">{job.applicationCount} applicants</span>
              ) : job.hasApplied ? (
                <button onClick={() => apply(job)} className="flex items-center gap-1 text-xs font-semibold text-success">
                  <CheckCircle2 className="h-4 w-4" /> Applied
                </button>
              ) : (
                <Button size="sm" onClick={() => apply(job)}>
                  Apply
                </Button>
              )}
            </div>
          </article>
        ))
      )}

      <PostJobSheet open={posting} onClose={() => setPosting(false)} onPosted={(job) => setJobs((l) => [{ ...job, isMine: true }, ...(l || [])])} />
      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          await api.deleteJob(removing.id);
          setJobs((l) => l?.filter((j) => j.id !== removing.id) || null);
          addToast('Posting removed', 'success');
        }}
        title="Remove this posting?"
        confirmLabel="Remove"
        danger
      />
    </div>
  );
};

const PostJobSheet: React.FC<{ open: boolean; onClose: () => void; onPosted: (job: JobPosting) => void }> = ({ open, onClose, onPosted }) => {
  const { addToast } = useAppStore();
  const { user } = useAuthStore();
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open)
      setForm({
        companyName: user?.companyName || '',
        jobType: 'Internship',
        officialCompanyEmail: user?.role === 'recruiter' ? user?.corporateEmail || user?.email || '' : '',
        location: '',
        salaryBracket: '',
        jobTitle: '',
        detailedRequirements: '',
        eligibleBatches: '',
        tags: '',
        deadline: '',
      });
  }, [open]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.postJob({ ...form, tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean) });
      onPosted(res.job);
      addToast('Opening published', 'success');
      onClose();
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Share an opportunity" height="tall">
      <form onSubmit={submit} className="space-y-3 p-5 pb-8">
        <SectionTitle>Role</SectionTitle>
        <input required value={form.jobTitle || ''} onChange={set('jobTitle')} placeholder="Job title" className="input" />
        <div className="grid grid-cols-2 gap-2">
          <select value={form.jobType} onChange={set('jobType')} className="input">
            <option>Internship</option>
            <option>Full-Time</option>
            <option>Non-Profit</option>
          </select>
          <input value={form.location || ''} onChange={set('location')} placeholder="Location" className="input" />
        </div>
        <input required value={form.salaryBracket || ''} onChange={set('salaryBracket')} placeholder="Salary / stipend (e.g. ₹40,000 / month)" className="input" />
        <textarea required value={form.detailedRequirements || ''} onChange={set('detailedRequirements')} rows={4} placeholder="Responsibilities & requirements" className="input resize-none" />
        <div className="grid grid-cols-2 gap-2">
          <input value={form.eligibleBatches || ''} onChange={set('eligibleBatches')} placeholder="Eligible batches" className="input" />
          <input type="date" value={form.deadline || ''} onChange={set('deadline')} className="input" />
        </div>
        <input value={form.tags || ''} onChange={set('tags')} placeholder="Skills (comma separated)" className="input" />
        <SectionTitle className="pt-2">Company</SectionTitle>
        <input required value={form.companyName || ''} onChange={set('companyName')} placeholder="Company name" className="input" />
        <input required type="email" value={form.officialCompanyEmail || ''} onChange={set('officialCompanyEmail')} placeholder="Official application email" className="input" />
        <p className="text-[11px] text-ink3">Must be on your company domain. Free email providers are blocked to protect students.</p>
        <Button type="submit" full size="lg" loading={busy}>
          Publish opening
        </Button>
      </form>
    </Sheet>
  );
};

const ListSkeleton: React.FC = () => (
  <div className="space-y-3">
    {[0, 1, 2].map((i) => (
      <div key={i} className="card space-y-3 p-4">
        <div className="flex gap-3">
          <Skeleton className="h-12 w-12 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-48 rounded" />
            <Skeleton className="h-3 w-28 rounded" />
          </div>
        </div>
        <Skeleton className="h-3 w-full rounded" />
      </div>
    ))}
  </div>
);
