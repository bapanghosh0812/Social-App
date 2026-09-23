import React, { useEffect, useState } from 'react';
import {
  Sun, Moon, Lock, Bell, ShieldCheck, LifeBuoy, FileText, KeyRound, LogOut, Trash2, ChevronRight, UserRound, Ban,
  MonitorSmartphone, VolumeX, AlertTriangle, Save, Eye, EyeOff,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { useVerificationStore } from '../../store/useVerificationStore.js';
import { api, setToken } from '../../services/api.js';
import type { Gender, MiniUser } from '../../types/index.js';
import { Sheet, ConfirmDialog } from '../ui/Sheet.js';
import { Avatar } from '../ui/Avatar.js';
import { Button, Spinner, Toggle } from '../ui/primitives.js';

export const ProfileSettingsModal: React.FC = () => {
  const { isSettingsOpen, settingsView, setSettingsOpen, setSettingsView, theme, toggleTheme, setHelpModalOpen, setLegalOpen, setIsAdminAuthPromptOpen, addToast } =
    useAppStore();
  const { user, config, updateLocalUser, logout } = useAuthStore();
  const openVerification = useVerificationStore((s) => s.openModal);
  const [confirmLogoutAll, setConfirmLogoutAll] = useState(false);

  if (!user) return null;
  const close = () => setSettingsOpen(false);

  const togglePrivate = async () => {
    const next = !user.isPrivate;
    updateLocalUser({ isPrivate: next });
    try {
      await api.updateProfileSettings({ isPrivate: next });
      addToast(next ? 'Your account is now private' : 'Your account is now public', 'success');
    } catch (err: any) {
      updateLocalUser({ isPrivate: !next });
      addToast(err.message, 'error');
    }
  };

  const toggleNotifs = async () => {
    const next = !user.globalNotificationsEnabled;
    updateLocalUser({ globalNotificationsEnabled: next });
    if (next && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    try {
      await api.toggleNotifications({ isGlobal: true, enabled: next });
    } catch (err: any) {
      updateLocalUser({ globalNotificationsEnabled: !next });
      addToast(err.message, 'error');
    }
  };

  const titles: Record<typeof settingsView, string> = {
    main: 'Settings',
    editProfile: 'Edit profile',
    password: 'Change password',
    blocked: 'Blocked & muted',
    delete: 'Delete account',
  };

  return (
    <Sheet
      open={isSettingsOpen}
      onClose={close}
      title={titles[settingsView]}
      height="tall"
      zIndex={64}
      headerRight={
        settingsView !== 'main' ? (
          <button onClick={() => setSettingsView('main')} className="h-9 rounded-full px-3 text-sm font-semibold text-brand hover:bg-brand/10">
            Back
          </button>
        ) : undefined
      }
    >
      {settingsView === 'main' && (
        <div className="space-y-6 px-4 pb-8 pt-4">
          <button onClick={() => setSettingsView('editProfile')} className="card flex w-full items-center gap-3 p-3 text-left hover:border-brand/40">
            <Avatar src={user.avatarUrl} name={user.fullName} size={52} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-ink">{user.fullName}</p>
              <p className="truncate text-xs text-ink3">{user.email}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-ink3" />
          </button>

          <Group title="Account">
            <NavRow icon={<UserRound className="h-4 w-4" />} title="Edit profile" onClick={() => setSettingsView('editProfile')} />
            {!user.isDemo && <NavRow icon={<KeyRound className="h-4 w-4" />} title="Change password" onClick={() => setSettingsView('password')} />}
            <NavRow
              icon={<ShieldCheck className="h-4 w-4" />}
              title="Verification"
              hint={user.verificationStatus === 'Verified Member' ? 'Verified' : user.verificationStatus}
              onClick={() => {
                close();
                openVerification();
              }}
            />
          </Group>

          <Group title="Privacy">
            <ToggleRow
              icon={<Lock className="h-4 w-4" />}
              title="Private account"
              subtitle={user.isPrivate ? 'Only approved followers see your posts' : 'Anyone on campus can see your posts'}
              on={user.isPrivate}
              onClick={togglePrivate}
            />
            <NavRow icon={<Ban className="h-4 w-4" />} title="Blocked accounts & muted colleges" onClick={() => setSettingsView('blocked')} />
          </Group>

          <Group title="Preferences">
            <ToggleRow icon={theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />} title="Dark mode" on={theme === 'dark'} onClick={toggleTheme} />
            <ToggleRow icon={<Bell className="h-4 w-4" />} title="Notifications" subtitle="Likes, comments, follows, messages" on={user.globalNotificationsEnabled} onClick={toggleNotifs} />
          </Group>

          <Group title="Support">
            <NavRow
              icon={<LifeBuoy className="h-4 w-4" />}
              title="Help & safety center"
              onClick={() => {
                close();
                setHelpModalOpen(true);
              }}
            />
            <NavRow icon={<FileText className="h-4 w-4" />} title="Terms & privacy policy" onClick={() => setLegalOpen(true)} />
          </Group>

          {user.isAdmin && config?.adminConsole && (
            <Group title="Administration">
              <NavRow
                icon={<KeyRound className="h-4 w-4" />}
                title="Admin console"
                hint="PIN protected"
                onClick={() => {
                  close();
                  setIsAdminAuthPromptOpen(true);
                }}
              />
            </Group>
          )}

          <Group title="Security">
            <NavRow icon={<MonitorSmartphone className="h-4 w-4" />} title="Log out of all devices" onClick={() => setConfirmLogoutAll(true)} />
          </Group>

          <div className="space-y-2">
            <Button
              variant="secondary"
              full
              icon={<LogOut className="h-4 w-4" />}
              onClick={() => {
                close();
                logout();
                addToast('Logged out', 'info');
              }}
            >
              Log out
            </Button>
            {!user.isDemo && (
              <button onClick={() => setSettingsView('delete')} className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold text-danger hover:bg-danger/10">
                <Trash2 className="h-4 w-4" /> Delete account
              </button>
            )}
          </div>
          <p className="text-center text-[11px] text-ink3">College Campus · v2.0</p>
        </div>
      )}

      {settingsView === 'editProfile' && <EditProfile />}
      {settingsView === 'password' && <ChangePassword />}
      {settingsView === 'blocked' && <BlockedAndMuted />}
      {settingsView === 'delete' && <DeleteAccount />}

      <ConfirmDialog
        open={confirmLogoutAll}
        onClose={() => setConfirmLogoutAll(false)}
        title="Log out everywhere?"
        message="Every device signed in to your account — including this one — will be logged out."
        confirmLabel="Log out everywhere"
        danger
        onConfirm={async () => {
          try {
            await api.logoutAll();
          } catch {
            /* token already revoked */
          }
          close();
          logout();
          addToast('Logged out of all devices', 'success');
        }}
      />
    </Sheet>
  );
};

const Group: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section>
    <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.16em] text-ink3">{title}</p>
    <div className="card divide-y divide-line overflow-hidden">{children}</div>
  </section>
);

const RowIcon: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">{children}</span>
);

const NavRow: React.FC<{ icon: React.ReactNode; title: string; hint?: string; onClick: () => void }> = ({ icon, title, hint, onClick }) => (
  <button onClick={onClick} className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-ink/5">
    <RowIcon>{icon}</RowIcon>
    <span className="flex-1 text-[15px] text-ink">{title}</span>
    {hint && <span className="text-xs text-ink3">{hint}</span>}
    <ChevronRight className="h-4 w-4 text-ink3" />
  </button>
);

const ToggleRow: React.FC<{ icon: React.ReactNode; title: string; subtitle?: string; on: boolean; onClick: () => void }> = ({ icon, title, subtitle, on, onClick }) => (
  <div className="flex items-center gap-3 px-3 py-3">
    <RowIcon>{icon}</RowIcon>
    <div className="min-w-0 flex-1">
      <p className="text-[15px] text-ink">{title}</p>
      {subtitle && <p className="truncate text-xs text-ink3">{subtitle}</p>}
    </div>
    <Toggle on={on} onClick={onClick} label={title} />
  </div>
);

const EditProfile: React.FC = () => {
  const { user, updateLocalUser } = useAuthStore();
  const { setSettingsView, addToast } = useAppStore();
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [headline, setHeadline] = useState(user?.headline || '');
  const [department, setDepartment] = useState(user?.department || '');
  const [designation, setDesignation] = useState(user?.designation || '');
  const [skills, setSkills] = useState<string[]>(user?.skills || []);
  const [skillInput, setSkillInput] = useState('');
  const [bio, setBio] = useState(user?.bio || '');
  const [gender, setGender] = useState<Gender | ''>(user?.gender || '');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  if (!user) return null;
  const isFaculty = user.role === 'faculty';

  const addSkill = () => {
    const parts = skillInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    setSkills((list) => Array.from(new Set([...list, ...parts])).slice(0, 20));
    setSkillInput('');
  };

  const save = async () => {
    setBusy(true);
    try {
      const pending = skillInput.trim() ? Array.from(new Set([...skills, ...skillInput.split(',').map((s) => s.trim()).filter(Boolean)])) : skills;
      const res = await api.updateProfileSettings({
        fullName: fullName.trim(),
        headline: headline.trim(),
        department: department.trim(),
        ...(isFaculty ? { designation: designation.trim() } : {}),
        skills: pending,
        bio: bio.trim(),
        ...(gender ? { gender } : {}),
      });
      updateLocalUser(res.user);
      addToast('Profile saved', 'success');
      setSettingsView('main');
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const changePhoto = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const up = await api.uploadMedia(file, 'avatars');
      await api.updateProfileSettings({ avatarUrl: up.url });
      updateLocalUser({ avatarUrl: up.url });
      addToast('Profile photo updated', 'success');
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4 p-5 pb-8">
      <div className="flex flex-col items-center gap-2">
        <Avatar src={user.avatarUrl} name={user.fullName} size={96} ring="gold" />
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => changePhoto(e.target.files?.[0])} />
        <div className="flex gap-2">
          <button onClick={() => fileRef.current?.click()} className="text-sm font-semibold text-brand">
            {uploading ? 'Uploading…' : 'Change photo'}
          </button>
          {user.avatarUrl && (
            <button
              onClick={async () => {
                await api.updateProfileSettings({ avatarUrl: '' });
                updateLocalUser({ avatarUrl: '' });
              }}
              className="text-sm font-semibold text-ink3"
            >
              Remove
            </button>
          )}
        </div>
      </div>
      <div>
        <label className="label">Name</label>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={80} className="input" />
      </div>
      <div>
        <label className="label">Headline</label>
        <input
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          maxLength={120}
          placeholder={isFaculty ? 'e.g. Assistant Professor of Physics · Researcher in optics' : 'e.g. B.Tech CSE ’27 · Web developer · Techfest core team'}
          className="input"
        />
        <p className="mt-1 text-[11px] text-ink3">Shown under your name on posts and your profile. Leave empty to use your college and department.</p>
      </div>
      <div className={isFaculty ? 'grid grid-cols-2 gap-2' : ''}>
        <div>
          <label className="label">Department</label>
          <input value={department} onChange={(e) => setDepartment(e.target.value)} maxLength={80} placeholder={isFaculty ? 'Physics' : 'Computer Science'} className="input" />
        </div>
        {isFaculty && (
          <div>
            <label className="label">Designation</label>
            <input value={designation} onChange={(e) => setDesignation(e.target.value)} maxLength={80} placeholder="Assistant Professor" className="input" />
          </div>
        )}
      </div>
      <div>
        <label className="label">{isFaculty ? 'Expertise' : 'Skills'}</label>
        <div className="flex gap-2">
          <input
            value={skillInput}
            onChange={(e) => setSkillInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addSkill();
              }
            }}
            placeholder="Type a skill and press Enter"
            className="input"
          />
          <Button type="button" variant="secondary" onClick={addSkill}>
            Add
          </Button>
        </div>
        {skills.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {skills.map((s) => (
              <button key={s} type="button" onClick={() => setSkills((l) => l.filter((x) => x !== s))} className="chip chip-active" aria-label={`Remove ${s}`}>
                {s} ×
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <label className="label">About</label>
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} maxLength={1000} placeholder="Tell people about your studies, teaching, research or interests" className="input resize-none" />
        <p className="mt-1 text-right text-[11px] text-ink3">{bio.length}/1000</p>
      </div>
      <div>
        <label className="label">Gender</label>
        <select value={gender} onChange={(e) => setGender(e.target.value as Gender)} className="input">
          <option value="">Not set</option>
          {['Male', 'Female', 'Other', 'Prefer not to say'].map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
      </div>
      <div className="rounded-2xl border border-line bg-sunken/60 p-3 text-xs text-ink2">
        <span className="font-semibold text-ink">College:</span> {user.collegeName || '—'} · locked to keep campuses authentic
      </div>
      <Button full size="lg" loading={busy} onClick={save} disabled={fullName.trim().length < 2} icon={<Save className="h-4 w-4" />}>
        Save changes
      </Button>
    </div>
  );
};

const ChangePassword: React.FC = () => {
  const { setSettingsView, addToast } = useAppStore();
  const { applySession, user } = useAuthStore();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const mismatch = confirm.length > 0 && confirm !== next;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mismatch) return;
    setBusy(true);
    try {
      const res = await api.changePassword(current, next);
      setToken(res.token);
      applySession(res);
      addToast('Password updated. Other devices were signed out.', 'success');
      setSettingsView('main');
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 p-5 pb-8">
      {user?.authProvider !== 'google' && (
        <div>
          <label className="label">Current password</label>
          <input type={show ? 'text' : 'password'} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" className="input" required />
        </div>
      )}
      <div>
        <label className="label">New password</label>
        <div className="relative">
          <input type={show ? 'text' : 'password'} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" className="input pr-11" required minLength={8} />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink3" aria-label="Show password">
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-ink3">At least 8 characters with a letter and a number.</p>
      </div>
      <div>
        <label className="label">Confirm new password</label>
        <input type={show ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" className="input" required />
        {mismatch && <p className="mt-1.5 text-xs text-danger">Passwords don't match.</p>}
      </div>
      <Button type="submit" full size="lg" loading={busy} disabled={mismatch || next.length < 8}>
        Update password
      </Button>
    </form>
  );
};

const BlockedAndMuted: React.FC = () => {
  const { addToast } = useAppStore();
  const { user, updateLocalUser } = useAuthStore();
  const [blocked, setBlocked] = useState<MiniUser[] | null>(null);
  const [colleges, setColleges] = useState<Record<string, string>>({});

  useEffect(() => {
    api.getBlocked().then((r) => setBlocked(r.users)).catch(() => setBlocked([]));
    (user?.mutedCollegeIds || []).forEach((id) =>
      api.getCollegeHub(id).then((r) => setColleges((c) => ({ ...c, [id]: r.college.name }))).catch(() => {})
    );
  }, []);

  return (
    <div className="space-y-6 p-5 pb-8">
      <section className="space-y-2">
        <p className="px-1 text-[11px] font-bold uppercase tracking-[0.16em] text-ink3">Blocked accounts</p>
        {blocked === null ? (
          <Spinner />
        ) : blocked.length === 0 ? (
          <p className="text-sm text-ink3">You haven't blocked anyone.</p>
        ) : (
          blocked.map((u) => (
            <div key={u.id} className="flex items-center gap-3">
              <Avatar src={u.avatarUrl} name={u.fullName} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{u.fullName}</p>
                <p className="truncate text-xs text-ink3">{u.collegeName}</p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  await api.unblock(u.id);
                  setBlocked((l) => l?.filter((x) => x.id !== u.id) || null);
                  addToast(`Unblocked ${u.fullName}`, 'success');
                }}
              >
                Unblock
              </Button>
            </div>
          ))
        )}
      </section>
      <section className="space-y-2">
        <p className="px-1 text-[11px] font-bold uppercase tracking-[0.16em] text-ink3">Muted colleges</p>
        {(user?.mutedCollegeIds || []).length === 0 ? (
          <p className="text-sm text-ink3">No muted colleges. Mute one from any post's ⋯ menu.</p>
        ) : (
          user!.mutedCollegeIds!.map((id) => (
            <div key={id} className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ink/5 text-ink3">
                <VolumeX className="h-5 w-5" />
              </span>
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{colleges[id] || 'College'}</p>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  const res = await api.muteCollege(id, false);
                  updateLocalUser({ mutedCollegeIds: res.mutedCollegeIds });
                  addToast(res.message, 'success');
                }}
              >
                Unmute
              </Button>
            </div>
          ))
        )}
      </section>
    </div>
  );
};

const DeleteAccount: React.FC = () => {
  const { user, logout } = useAuthStore();
  const { setSettingsOpen, addToast } = useAppStore();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  const matches = typed.trim().toLowerCase() === user.email.toLowerCase();

  return (
    <div className="space-y-4 p-5 pb-8">
      <div className="rounded-2xl border border-danger/30 bg-danger/10 p-4">
        <p className="flex items-center gap-2 font-semibold text-danger">
          <AlertTriangle className="h-5 w-5" /> This can't be undone
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-ink2">
          Your profile, posts, reels, stories, comments, messages and verification records are permanently deleted.
        </p>
      </div>
      <p className="rounded-2xl border border-line bg-sunken/60 p-3 text-xs leading-relaxed text-ink2">
        For your safety, accounts that aren't used for 30 days are deleted automatically.
      </p>
      <div>
        <label className="label">Type {user.email} to confirm</label>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className="input" />
      </div>
      <Button
        variant="danger"
        full
        size="lg"
        loading={busy}
        disabled={!matches}
        icon={<Trash2 className="h-4 w-4" />}
        onClick={async () => {
          setBusy(true);
          try {
            await api.deleteAccount(typed.trim());
            setSettingsOpen(false);
            logout();
            addToast('Your account has been deleted', 'info');
          } catch (err: any) {
            addToast(err.message, 'error');
          } finally {
            setBusy(false);
          }
        }}
      >
        Permanently delete my account
      </Button>
    </div>
  );
};
