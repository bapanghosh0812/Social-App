import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { KeyRound, ShieldCheck, ShieldAlert, Lock } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore.js';
import { api } from '../../services/api.js';
import { Sheet } from '../ui/Sheet.js';
import { Spinner } from '../ui/primitives.js';

type Status = 'idle' | 'verifying' | 'verified' | 'rejected';
const LEN = 6;

/** 6-digit PIN step-up for the admin console (only for accounts in ADMIN_EMAILS). */
export const AdminAuthModal: React.FC = () => {
  const { isAdminAuthPromptOpen, setIsAdminAuthPromptOpen, setAdminConsoleOpen, setAdminPin } = useAppStore();
  const [digits, setDigits] = useState<string[]>(Array(LEN).fill(''));
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (!isAdminAuthPromptOpen) return;
    setDigits(Array(LEN).fill(''));
    setStatus('idle');
    setError('');
    setTimeout(() => inputs.current[0]?.focus(), 150);
  }, [isAdminAuthPromptOpen]);

  const verify = async (pin: string) => {
    setStatus('verifying');
    setError('');
    try {
      await api.adminUnlock(pin);
      setStatus('verified');
      setAdminPin(pin);
      setTimeout(() => {
        setIsAdminAuthPromptOpen(false);
        setAdminConsoleOpen(true);
      }, 700);
    } catch (err: any) {
      setStatus('rejected');
      setError(err.message || 'Access denied.');
      setTimeout(() => {
        setDigits(Array(LEN).fill(''));
        setStatus('idle');
        inputs.current[0]?.focus();
      }, 1400);
    }
  };

  const onChange = (i: number, val: string) => {
    if (status !== 'idle') return;
    const clean = val.replace(/\D/g, '');
    const next = [...digits];
    if (!clean) {
      next[i] = '';
      setDigits(next);
      return;
    }
    let idx = i;
    for (const ch of clean) {
      if (idx >= LEN) break;
      next[idx++] = ch;
    }
    setDigits(next);
    inputs.current[Math.min(idx, LEN - 1)]?.focus();
    if (next.every(Boolean)) verify(next.join(''));
  };

  return (
    <Sheet open={isAdminAuthPromptOpen} onClose={() => setIsAdminAuthPromptOpen(false)} maxWidth="sm:max-w-sm" zIndex={90}>
      <div className="px-6 pb-8 pt-4 text-center safe-bottom">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-brand-grad text-onbrand shadow-brand">
          <KeyRound className="h-8 w-8" />
        </div>
        <h3 className="mt-4 font-display text-2xl font-semibold text-ink">Admin console</h3>
        <p className="mt-1 text-sm text-ink2">Enter your 6-digit admin PIN</p>

        <div className="mt-6 flex h-20 items-center justify-center">
          <AnimatePresence mode="wait">
            {status === 'idle' && (
              <motion.div key="pin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex gap-2">
                {digits.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      inputs.current[i] = el;
                    }}
                    value={d}
                    onChange={(e) => onChange(i, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Backspace' && !digits[i] && i > 0) {
                        const next = [...digits];
                        next[i - 1] = '';
                        setDigits(next);
                        inputs.current[i - 1]?.focus();
                      }
                    }}
                    inputMode="numeric"
                    type="password"
                    maxLength={LEN}
                    autoComplete="one-time-code"
                    aria-label={`PIN digit ${i + 1}`}
                    className={`h-14 w-11 rounded-2xl border-2 bg-sunken text-center text-2xl font-bold text-ink outline-none transition-colors ${
                      d ? 'border-brand' : 'border-line focus:border-brand/60'
                    }`}
                  />
                ))}
              </motion.div>
            )}
            {status === 'verifying' && (
              <motion.div key="v" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-2">
                <Spinner size={30} />
                <span className="text-xs text-ink2">Verifying…</span>
              </motion.div>
            )}
            {status === 'verified' && (
              <motion.div key="ok" initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex flex-col items-center gap-1 text-success">
                <ShieldCheck className="h-12 w-12" />
                <span className="text-sm font-semibold">Unlocked</span>
              </motion.div>
            )}
            {status === 'rejected' && (
              <motion.div key="no" initial={{ scale: 0 }} animate={{ scale: 1, x: [0, -8, 8, -6, 6, 0] }} className="flex flex-col items-center gap-1 text-danger">
                <ShieldAlert className="h-12 w-12" />
                <span className="text-sm font-semibold">{error}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-ink3">
          <Lock className="h-3 w-3" /> Admins only · 5 wrong attempts lock the console for 30 minutes
        </p>
      </div>
    </Sheet>
  );
};
