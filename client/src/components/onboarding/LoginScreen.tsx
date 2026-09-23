import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Lock, User as UserIcon, Eye, EyeOff, ArrowRight, Sparkles, ShieldCheck, Clapperboard, MessageCircle, Radio, ArrowLeft, KeyRound, WifiOff } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore.js';
import { useAppStore } from '../../store/useAppStore.js';
import { api } from '../../services/api.js';
import { FullLogo } from '../brand/Logo.js';
import { Button, Segmented } from '../ui/primitives.js';

type Mode = 'login' | 'signup' | 'forgot' | 'reset';

declare global {
  interface Window {
    google?: any;
  }
}

export const LoginScreen: React.FC = () => {
  const { login, register, loginDemo, loginWithGoogle, applySession, config, serverDown } = useAuthStore();
  const { addToast } = useAppStore();
  const resetToken = useRef<string | null>(new URLSearchParams(window.location.search).get('reset'));

  const [mode, setMode] = useState<Mode>(resetToken.current ? 'reset' : 'login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const googleBtn = useRef<HTMLDivElement>(null);

  // Google Identity Services (only when a client ID is configured on the server).
  useEffect(() => {
    const clientId = config?.googleClientId;
    if (!clientId || (mode !== 'login' && mode !== 'signup')) return;
    const render = () => {
      if (!window.google || !googleBtn.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (resp: { credential: string }) => {
          try {
            await loginWithGoogle(resp.credential);
          } catch (err: any) {
            setError(err.message);
          }
        },
      });
      googleBtn.current.innerHTML = '';
      window.google.accounts.id.renderButton(googleBtn.current, { theme: 'outline', size: 'large', shape: 'pill', width: 320, text: 'continue_with' });
    };
    if (window.google) render();
    else {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = render;
      document.head.appendChild(s);
    }
  }, [config?.googleClientId, mode]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setInfo(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        await login({ email: email.trim(), password });
      } else if (mode === 'signup') {
        if (fullName.trim().length < 2) throw new Error('Please enter your full name.');
        await register({ fullName: fullName.trim(), email: email.trim(), password });
        addToast('Welcome to College Campus ✨', 'success');
      } else if (mode === 'forgot') {
        const res = await api.forgotPassword(email.trim());
        setInfo(res.message);
      } else if (mode === 'reset') {
        if (password !== confirm) throw new Error("Passwords don't match.");
        const res = await api.resetPassword(resetToken.current || '', password);
        window.history.replaceState({}, '', window.location.pathname);
        applySession(res);
        addToast('Password reset — you are signed in', 'success');
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const tryDemo = async () => {
    setDemoBusy(true);
    setError(null);
    try {
      await loginDemo();
      addToast('You are exploring the demo campus', 'success');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDemoBusy(false);
    }
  };

  return (
    <div className="relative min-h-[var(--app-h)] overflow-hidden">
      {/* Soft navy & gold glow, like the logo */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-48 left-1/2 h-[460px] w-[460px] -translate-x-1/2 rounded-full bg-gold/15 blur-[110px]" />
        <div className="absolute -bottom-40 -right-24 h-80 w-80 rounded-full bg-brand/10 blur-[100px]" />
      </div>

      <div className="relative mx-auto flex min-h-[var(--app-h)] max-w-md flex-col justify-center px-6 py-8">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="space-y-6">
          <div className="space-y-3 text-center">
            <FullLogo className="mx-auto w-44" />
            <p className="text-[15px] leading-snug text-ink2">
              The verified network for <strong className="text-ink">teachers & students</strong> of every college in India.
            </p>
            <div className="flex flex-wrap justify-center gap-2 text-[11px] text-ink2">
              {[
                { icon: <ShieldCheck className="h-3.5 w-3.5" />, label: 'Verified members' },
                { icon: <Clapperboard className="h-3.5 w-3.5" />, label: 'Reels' },
                { icon: <MessageCircle className="h-3.5 w-3.5" />, label: 'Messages' },
                { icon: <Radio className="h-3.5 w-3.5" />, label: 'Live' },
              ].map((f) => (
                <span key={f.label} className="flex items-center gap-1 rounded-full border border-line bg-elev/70 px-2.5 py-1 backdrop-blur">
                  <span className="text-brand">{f.icon}</span> {f.label}
                </span>
              ))}
            </div>
          </div>

          {serverDown && (
            <div role="status" className="flex items-center gap-3 rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3 text-[13px] text-ink2">
              <WifiOff className="h-4 w-4 shrink-0 text-gold2" />
              <span className="flex-1">
                Server not connected yet — sign-in is paused. Tap <strong className="text-ink">Try the live demo</strong> to explore the full app.
              </span>
              <button onClick={() => window.location.reload()} className="shrink-0 font-semibold text-brand hover:underline">
                Retry
              </button>
            </div>
          )}

          <div className="space-y-5 rounded-4xl border border-line bg-elev p-6 shadow-lift">
            {(mode === 'login' || mode === 'signup') && (
              <Segmented
                id="auth-mode"
                value={mode}
                onChange={(m) => switchMode(m)}
                options={[
                  { value: 'login', label: 'Sign in' },
                  { value: 'signup', label: 'Create account' },
                ]}
              />
            )}
            {(mode === 'forgot' || mode === 'reset') && (
              <div className="flex items-center gap-3">
                {mode === 'forgot' && (
                  <button onClick={() => switchMode('login')} aria-label="Back" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-ink/5">
                    <ArrowLeft className="h-5 w-5 text-ink2" />
                  </button>
                )}
                <div>
                  <h2 className="font-display text-xl font-semibold text-ink">{mode === 'forgot' ? 'Reset your password' : 'Choose a new password'}</h2>
                  <p className="text-xs text-ink3">{mode === 'forgot' ? "We'll email you a secure link." : 'Use 8+ characters with a letter and a number.'}</p>
                </div>
              </div>
            )}

            <form onSubmit={submit} className="space-y-3">
              {mode === 'signup' && (
                <Field icon={<UserIcon className="h-4 w-4" />}>
                  <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" autoComplete="name" className="input pl-11" required />
                </Field>
              )}
              {mode !== 'reset' && (
                <Field icon={<Mail className="h-4 w-4" />}>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" autoComplete="email" className="input pl-11" required />
                </Field>
              )}
              {mode !== 'forgot' && (
                <Field icon={<Lock className="h-4 w-4" />}>
                  <input
                    type={show ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'login' ? 'Password' : 'New password'}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    className="input pl-11 pr-11"
                    required
                    minLength={mode === 'login' ? 1 : 8}
                  />
                  <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-4 top-1/2 -translate-y-1/2 text-ink3 hover:text-ink">
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </Field>
              )}
              {mode === 'reset' && (
                <Field icon={<KeyRound className="h-4 w-4" />}>
                  <input type={show ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm new password" autoComplete="new-password" className="input pl-11" required />
                </Field>
              )}
              {mode === 'signup' && <p className="px-1 text-[11px] text-ink3">8+ characters with at least one letter and one number.</p>}

              {error && <p className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-[13px] text-danger">{error}</p>}
              {info && <p className="rounded-2xl border border-success/30 bg-success/10 px-4 py-3 text-[13px] text-success">{info}</p>}

              <Button type="submit" full size="lg" loading={busy} icon={!busy ? <ArrowRight className="h-4 w-4" /> : undefined} className="flex-row-reverse">
                {mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Save & sign in'}
              </Button>

              {mode === 'login' && (
                <button type="button" onClick={() => switchMode('forgot')} className="block w-full text-center text-[13px] font-medium text-ink2 hover:text-brand">
                  Forgot password?
                </button>
              )}
            </form>

            {(mode === 'login' || mode === 'signup') && config?.googleClientId && (
              <>
                <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.2em] text-ink3">
                  <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
                </div>
                <div ref={googleBtn} className="flex justify-center" />
              </>
            )}
          </div>

          {(config?.demoMode || serverDown) && (mode === 'login' || mode === 'signup') && (
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={tryDemo}
              disabled={demoBusy}
              className="group flex w-full items-center gap-3 rounded-3xl border border-brand/40 bg-brand/[0.08] p-4 text-left transition-colors hover:bg-brand/[0.14] disabled:opacity-60"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-grad text-onbrand shadow-brand">
                <Sparkles className="h-5 w-5" />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-semibold text-ink">{demoBusy ? 'Opening the demo…' : 'Try the live demo'}</span>
                <span className="block text-xs text-ink2">Explore a sample campus with reels, stories, DMs & more</span>
              </span>
              <ArrowRight className="h-4 w-4 text-brand transition-transform group-hover:translate-x-0.5" />
            </motion.button>
          )}

          <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-ink3">
            <ShieldCheck className="h-3.5 w-3.5 text-success" />
            Passwords hashed · Private documents · Rate-limited sign-in
          </p>
        </motion.div>
      </div>
    </div>
  );
};

const Field: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({ icon, children }) => (
  <div className="relative">
    <span className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-ink3">{icon}</span>
    {children}
  </div>
);
