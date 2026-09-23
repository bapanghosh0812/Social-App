import React from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

// --- Button ---------------------------------------------------------------
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onAnimationStart' | 'onDrag' | 'onDragStart' | 'onDragEnd' | 'style'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  full?: boolean;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-grad text-onbrand shadow-brand hover:brightness-110 active:brightness-95',
  secondary: 'bg-elev2 text-ink border border-line hover:border-line2',
  outline: 'bg-transparent text-brand border border-brand/50 hover:bg-brand/10',
  ghost: 'bg-transparent text-ink2 hover:text-ink hover:bg-ink/5',
  danger: 'bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20',
};
const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs rounded-xl gap-1.5',
  md: 'h-10 px-4 text-sm rounded-2xl gap-2',
  lg: 'h-12 px-5 text-[15px] rounded-2xl gap-2',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  full,
  className = '',
  children,
  disabled,
  ...rest
}) => (
  <motion.button
    whileTap={disabled || loading ? undefined : { scale: 0.97 }}
    disabled={disabled || loading}
    className={`inline-flex select-none items-center justify-center font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${full ? 'w-full' : ''} ${className}`}
    {...rest}
  >
    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
    {children}
  </motion.button>
);

// --- IconButton -----------------------------------------------------------
interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onAnimationStart' | 'onDrag' | 'onDragStart' | 'onDragEnd' | 'style'> {
  label: string;
  tone?: 'default' | 'glass' | 'solid';
  size?: number;
  badge?: number;
}

export const IconButton: React.FC<IconButtonProps> = ({ label, tone = 'default', size = 40, badge, className = '', children, ...rest }) => {
  const toneCls =
    tone === 'glass'
      ? 'bg-black/35 text-white backdrop-blur-md border border-white/15 hover:bg-black/50'
      : tone === 'solid'
        ? 'bg-elev2 text-ink border border-line hover:border-line2'
        : 'text-ink2 hover:text-ink hover:bg-ink/5';
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      aria-label={label}
      title={label}
      style={{ width: size, height: size }}
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full transition-colors ${toneCls} ${className}`}
      {...rest}
    >
      {children}
      {badge ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white ring-2 ring-bg">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </motion.button>
  );
};

// --- Spinner / Skeleton ---------------------------------------------------
export const Spinner: React.FC<{ size?: number; className?: string }> = ({ size = 22, className = '' }) => (
  <Loader2 style={{ width: size, height: size }} className={`animate-spin text-brand ${className}`} />
);

export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => <div className={`skeleton ${className}`} />;

// --- Empty state ------------------------------------------------------------
export const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  compact?: boolean;
}> = ({ icon, title, subtitle, action, compact }) => (
  <div className={`flex flex-col items-center justify-center text-center ${compact ? 'gap-2 py-8' : 'gap-3 py-16'} px-6`}>
    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-brand/25 bg-brand/10 text-brand">{icon}</div>
    <div>
      <p className="font-display text-lg font-semibold text-ink">{title}</p>
      {subtitle && <p className="mx-auto mt-1 max-w-[280px] text-sm text-ink2">{subtitle}</p>}
    </div>
    {action}
  </div>
);

// --- Segmented control -------------------------------------------------------
export function Segmented<T extends string>({
  id,
  value,
  onChange,
  options,
  className = '',
  size = 'md',
}: {
  id: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: React.ReactNode }[];
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div className={`flex gap-1 rounded-2xl border border-line bg-sunken/70 p-1 ${className}`}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-xl font-semibold transition-colors ${
              size === 'sm' ? 'h-8 px-2 text-xs' : 'h-9 px-3 text-[13px]'
            } ${active ? 'text-onbrand' : 'text-ink2 hover:text-ink'}`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-xl bg-brand-grad shadow-brand"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5 whitespace-nowrap">
              {o.icon}
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// --- Underline tabs ----------------------------------------------------------
export function Tabs<T extends string>({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: React.ReactNode }[];
}) {
  return (
    <div className="flex border-b border-line">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`relative flex flex-1 items-center justify-center gap-1.5 py-3 text-[13px] font-semibold transition-colors ${
              active ? 'text-ink' : 'text-ink3 hover:text-ink2'
            }`}
          >
            {o.icon}
            {o.label}
            {active && (
              <motion.span layoutId={`tab-${id}`} className="absolute bottom-[-1px] left-6 right-6 h-[2px] rounded-full bg-brand-grad" />
            )}
          </button>
        );
      })}
    </div>
  );
}

// --- Toggle --------------------------------------------------------------------
export const Toggle: React.FC<{ on: boolean; onClick: () => void; label?: string; disabled?: boolean }> = ({ on, onClick, label, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    disabled={disabled}
    onClick={onClick}
    className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-brand-grad' : 'bg-ink/15'}`}
  >
    <motion.span
      layout
      transition={{ type: 'spring', stiffness: 600, damping: 32 }}
      className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow ${on ? 'right-1' : 'left-1'}`}
    />
  </button>
);

// --- Progress bar --------------------------------------------------------------
export const Progress: React.FC<{ value: number; className?: string }> = ({ value, className = '' }) => (
  <div className={`h-1.5 w-full overflow-hidden rounded-full bg-ink/10 ${className}`}>
    <motion.div className="h-full rounded-full bg-brand-grad" animate={{ width: `${Math.round(Math.min(1, value) * 100)}%` }} />
  </div>
);

// --- Section header -------------------------------------------------------------
export const SectionTitle: React.FC<{ children: React.ReactNode; action?: React.ReactNode; className?: string }> = ({
  children,
  action,
  className = '',
}) => (
  <div className={`flex items-center justify-between px-1 ${className}`}>
    <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink3">{children}</h3>
    {action}
  </div>
);
