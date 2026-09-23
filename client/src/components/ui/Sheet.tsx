import React, { useEffect } from 'react';
import { AnimatePresence, motion, PanInfo, useDragControls } from 'framer-motion';
import { X } from 'lucide-react';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** 'auto' hugs content, 'tall' ~85% height, 'full' fills the screen on mobile. */
  height?: 'auto' | 'tall' | 'full';
  maxWidth?: string;
  zIndex?: number;
  headerRight?: React.ReactNode;
  bodyClassName?: string;
}

let openSheets = 0;

/**
 * Bottom sheet on phones, centered dialog on larger screens. Drag down or tap
 * the backdrop to dismiss; Escape also closes it.
 */
export const Sheet: React.FC<SheetProps> = ({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  height = 'auto',
  maxWidth = 'sm:max-w-lg',
  zIndex = 60,
  headerRight,
  bodyClassName = '',
}) => {
  const dragControls = useDragControls();

  useEffect(() => {
    if (!open) return;
    openSheets += 1;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      openSheets -= 1;
      if (openSheets <= 0) document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 110 || info.velocity.y > 700) onClose();
  };

  const heightCls =
    height === 'full' ? 'h-[100dvh] sm:h-[88vh]' : height === 'tall' ? 'h-[86dvh] sm:h-[80vh]' : 'max-h-[88dvh] sm:max-h-[85vh]';

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-6" style={{ zIndex }}>
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className={`relative flex w-full flex-col overflow-hidden border border-line bg-elev shadow-lift ${
              height === 'full' ? 'rounded-none sm:rounded-4xl' : 'rounded-t-4xl sm:rounded-4xl'
            } ${heightCls} ${maxWidth}`}
            initial={{ y: '100%', opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0.4 }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            drag={height === 'full' ? false : 'y'}
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={onDragEnd}
          >
            {height !== 'full' && (
              <div className="flex touch-none justify-center pb-1 pt-2.5 sm:hidden" onPointerDown={(e) => dragControls.start(e)}>
                <span className="h-1.5 w-10 rounded-full bg-ink/20" />
              </div>
            )}
            {(title || headerRight) && (
              <div
                className="flex touch-none items-center justify-between gap-3 border-b border-line px-5 pb-3 pt-3 sm:pt-4"
                onPointerDown={(e) => height !== 'full' && dragControls.start(e)}
              >
                <div className="min-w-0">
                  {title && <h2 className="truncate font-display text-lg font-semibold text-ink">{title}</h2>}
                  {subtitle && <p className="truncate text-xs text-ink3">{subtitle}</p>}
                </div>
                <div className="flex items-center gap-1">
                  {headerRight}
                  <button
                    onClick={onClose}
                    aria-label="Close"
                    className="flex h-9 w-9 items-center justify-center rounded-full text-ink2 transition-colors hover:bg-ink/5 hover:text-ink"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}
            <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${bodyClassName}`}>{children}</div>
            {footer && <div className="border-t border-line bg-elev px-4 py-3 safe-bottom">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

/** Styled confirmation dialog for destructive or important actions. */
export const ConfirmDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}> = ({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', danger }) => {
  const [busy, setBusy] = React.useState(false);
  return (
    <Sheet open={open} onClose={onClose} zIndex={80} maxWidth="sm:max-w-sm">
      <div className="space-y-5 px-6 pb-6 pt-4 text-center safe-bottom">
        <div>
          <h3 className="font-display text-xl font-semibold text-ink">{title}</h3>
          {message && <div className="mt-2 text-sm leading-relaxed text-ink2">{message}</div>}
        </div>
        <div className="flex flex-col gap-2">
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onClose();
              } finally {
                setBusy(false);
              }
            }}
            className={`h-12 rounded-2xl text-[15px] font-semibold transition-all disabled:opacity-60 ${
              danger ? 'bg-danger text-white hover:brightness-110' : 'bg-brand-grad text-onbrand shadow-brand'
            }`}
          >
            {busy ? 'Please wait…' : confirmLabel}
          </button>
          <button onClick={onClose} className="h-11 rounded-2xl text-sm font-semibold text-ink2 hover:bg-ink/5">
            Cancel
          </button>
        </div>
      </div>
    </Sheet>
  );
};

export interface ActionItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  hint?: string;
}

/** A list of actions presented in a sheet (the "⋯" menu everywhere). */
export const ActionSheet: React.FC<{ open: boolean; onClose: () => void; title?: string; items: ActionItem[] }> = ({
  open,
  onClose,
  title,
  items,
}) => (
  <Sheet open={open} onClose={onClose} title={title} zIndex={70} maxWidth="sm:max-w-sm">
    <div className="p-2 pb-4 safe-bottom">
      {items.map((it) => (
        <button
          key={it.label}
          onClick={() => {
            onClose();
            it.onClick();
          }}
          className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-[15px] font-medium transition-colors hover:bg-ink/5 ${
            it.danger ? 'text-danger' : 'text-ink'
          }`}
        >
          {it.icon && <span className={it.danger ? 'text-danger' : 'text-ink2'}>{it.icon}</span>}
          <span className="flex-1">{it.label}</span>
          {it.hint && <span className="text-xs text-ink3">{it.hint}</span>}
        </button>
      ))}
    </div>
  </Sheet>
);
