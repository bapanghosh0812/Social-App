import React, { useEffect, useState } from 'react';
import { User as UserIcon, Phone, Lock, Search, MapPin, Check, AlertTriangle, ArrowLeft, BookOpen, BriefcaseBusiness } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuthStore } from '../../store/useAuthStore.js';
import { useAppStore } from '../../store/useAppStore.js';
import { api } from '../../services/api.js';
import type { College, Gender } from '../../types/index.js';
import { Button } from '../ui/primitives.js';
import { RoleSelectionModal, type OnboardingRole } from './RoleSelectionModal.js';

const YEAR = new Date().getFullYear();
const BATCHES = [
  ...[0, 1, 2, 3].map((i) => `${YEAR - i}-${YEAR - i + 4}`),
  `${YEAR}-${YEAR + 2}`,
  `${YEAR - 1}-${YEAR + 1}`,
  `${YEAR}-${YEAR + 5}`,
];
const DESIGNATIONS = [
  'Professor',
  'Associate Professor',
  'Assistant Professor',
  'Head of Department',
  'Lecturer',
  'Guest Faculty',
  'Principal / Director',
  'Training & Placement Officer',
  'Librarian',
  'Lab Instructor',
];

/** Full-screen onboarding after sign-up (terms are accepted first). */
export const OnboardingForm: React.FC = () => {
  const { user, isOnboardingOpen, isTermsAccepted, completeOnboarding, logout } = useAuthStore();
  const { addToast } = useAppStore();
  const [role, setRole] = useState<'unselected' | OnboardingRole>('unselected');
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState<Gender>('Prefer not to say');
  const [phone, setPhone] = useState('');
  const [batch, setBatch] = useState(BATCHES[1]);
  const [department, setDepartment] = useState('');
  const [designation, setDesignation] = useState(DESIGNATIONS[2]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<College[]>([]);
  const [college, setCollege] = useState<College | null>(null);
  const [confirmLock, setConfirmLock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) setFullName(user.fullName);
  }, [user?.id]);

  useEffect(() => {
    if (college && query === college.name) return;
    const t = setTimeout(() => {
      api
        .searchColleges(query.trim())
        .then((r) => setResults(r.results.slice(0, 8)))
        .catch(() => {});
    }, 180);
    return () => clearTimeout(t);
  }, [query]);

  if (!user || !isOnboardingOpen || !isTermsAccepted) return null;
  const isFaculty = role === 'faculty';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!college) return setError('Please choose your college from the list.');
    if (isFaculty && !department.trim()) return setError('Please add your department.');
    if (!confirmLock) return setError('Please confirm your college — it can’t be changed later.');
    setBusy(true);
    try {
      await completeOnboarding({
        role: isFaculty ? 'faculty' : 'student',
        fullName: fullName.trim(),
        gender,
        phoneNumber: phone.trim() || undefined,
        collegeId: college.id,
        department: department.trim() || undefined,
        ...(isFaculty ? { designation } : { academicYear: batch }),
      });
      addToast(`Welcome to ${college.shortCode}! 🎓`, 'success');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-bg">
      <div className="pointer-events-none fixed -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-gold/15 blur-[110px]" />
      <div className="relative mx-auto max-w-md px-5 pb-12 pt-6 safe-top">
        <div className="mb-6 flex items-center justify-between">
          {role !== 'unselected' ? (
            <button onClick={() => setRole('unselected')} className="flex items-center gap-1 text-sm text-ink2">
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          ) : (
            <span />
          )}
          <button onClick={logout} className="text-sm text-ink3 hover:text-ink">
            Sign out
          </button>
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={role} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}>
            {role === 'unselected' ? (
              <RoleSelectionModal onSelectRole={setRole} />
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <h2 className="font-display text-2xl font-semibold text-ink">{isFaculty ? 'Set up your faculty profile' : 'Set up your student profile'}</h2>
                  <p className="text-sm text-ink2">{isFaculty ? 'Students and colleagues will find you by this.' : 'This is how classmates and teachers will find you.'}</p>
                </div>
                <div className="relative">
                  <UserIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink3" />
                  <input required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={isFaculty ? 'Full name (e.g. Dr. Anita Rao)' : 'Full name'} className="input pl-11" />
                </div>
                <div className="relative">
                  <BookOpen className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink3" />
                  <input
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder={isFaculty ? 'Department (e.g. Physics)' : 'Course / department (optional)'}
                    maxLength={80}
                    className="input pl-11"
                    required={isFaculty}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select value={gender} onChange={(e) => setGender(e.target.value as Gender)} className="input">
                    {['Male', 'Female', 'Other', 'Prefer not to say'].map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                  </select>
                  {isFaculty ? (
                    <select value={designation} onChange={(e) => setDesignation(e.target.value)} className="input">
                      {DESIGNATIONS.map((d) => (
                        <option key={d}>{d}</option>
                      ))}
                    </select>
                  ) : (
                    <select value={batch} onChange={(e) => setBatch(e.target.value)} className="input">
                      {BATCHES.map((b) => (
                        <option key={b} value={b}>
                          Batch {b.replace('-', '–')}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink3" />
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)" className="input pl-11" />
                </div>

                <div className="space-y-2">
                  <label className="label">{isFaculty ? 'College you teach at' : 'Your college'}</label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink3" />
                    <input
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setCollege(null);
                        setConfirmLock(false);
                      }}
                      placeholder="Search e.g. IIT Bombay, Jadavpur, AIIMS"
                      className="input pl-11"
                    />
                  </div>
                  {!college && results.length > 0 && (
                    <div className="card max-h-72 divide-y divide-line overflow-y-auto">
                      {results.map((c) => (
                        <button
                          type="button"
                          key={c.id}
                          onClick={() => {
                            setCollege(c);
                            setQuery(c.name);
                          }}
                          className="flex w-full items-center gap-3 p-3 text-left hover:bg-ink/5"
                        >
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-[11px] font-bold text-brand">{c.shortCode.slice(0, 4)}</span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-ink">{c.name}</span>
                            <span className="flex items-center gap-1 text-xs text-ink3">
                              <MapPin className="h-3 w-3" /> {c.city}, {c.state} · {c.type}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {college && (
                    <div className="flex items-center gap-3 rounded-2xl border border-brand/40 bg-brand/[0.06] p-3">
                      <Check className="h-5 w-5 text-brand" />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{college.name}</span>
                    </div>
                  )}
                </div>

                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-sunken/60 p-4">
                  <input type="checkbox" checked={confirmLock} onChange={(e) => setConfirmLock(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[rgb(var(--brand))]" />
                  <span className="text-[13px] leading-relaxed text-ink2">
                    <span className="mb-0.5 flex items-center gap-1.5 font-semibold text-ink">
                      <Lock className="h-3.5 w-3.5 text-brand" /> This choice is permanent
                    </span>
                    I'm a genuine {isFaculty ? 'faculty member' : 'student'} of <strong className="text-ink">{college?.name || 'this college'}</strong>. I understand my college can't be changed later.
                  </span>
                </label>

                {error && (
                  <p className="flex items-center gap-2 rounded-2xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
                  </p>
                )}
                <Button type="submit" full size="lg" loading={busy} disabled={!college || !confirmLock} icon={isFaculty ? <BriefcaseBusiness className="h-4 w-4" /> : undefined}>
                  {isFaculty ? 'Join as faculty' : 'Join my campus'}
                </Button>
              </form>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};
