'use client';
import clsx from 'clsx';
import { create } from 'zustand';
import { Loader2, X, CheckCircle2, AlertTriangle, Info, XCircle } from 'lucide-react';
import {
  forwardRef, useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';
import type { Tone } from '@/lib/format';

/* ---------------- Botão ---------------- */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-strong shadow-[0_8px_24px_-10px_rgba(59,130,246,0.8)]',
  secondary: 'bg-ink-700 text-slate-100 hover:bg-ink-600 border border-line-strong',
  ghost: 'bg-transparent text-slate-300 hover:bg-white/5',
  danger: 'bg-bad/90 text-white hover:bg-bad',
  success: 'bg-ok/90 text-white hover:bg-ok',
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; size?: 'sm' | 'md' | 'lg'; icon?: ReactNode }>(
  function Button({ variant = 'primary', loading, size = 'md', icon, className, children, disabled, ...rest }, ref) {
    return (
      <button
        ref={ref}
        className={clsx(
          'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition select-none disabled:opacity-50 disabled:cursor-not-allowed',
          // Alvos de toque de no mínimo 44px em telas sensíveis ao toque.
          size === 'sm' && 'min-h-9 px-3 text-sm',
          size === 'md' && 'min-h-11 px-4 text-sm',
          size === 'lg' && 'min-h-12 px-5 text-base',
          variants[variant],
          className,
        )}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...rest}
      >
        {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
        {children}
      </button>
    );
  },
);

/* ---------------- Cartões e layout ---------------- */
export function Card({ className, children, title, action, subtitle }: { className?: string; children: ReactNode; title?: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <section className={clsx('card p-4 sm:p-5', className)}>
      {(title || action) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold text-slate-100">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-slate-400">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const toneClasses: Record<Tone, string> = {
  ok: 'bg-ok/15 text-green-300 border-ok/30',
  warn: 'bg-warn/15 text-amber-300 border-warn/30',
  bad: 'bg-bad/15 text-red-300 border-bad/30',
  info: 'bg-brand/15 text-blue-300 border-brand/30',
  neutral: 'bg-white/5 text-slate-300 border-line-strong',
};
const dotClasses: Record<Tone, string> = { ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad', info: 'bg-brand', neutral: 'bg-slate-500' };

/** Estado com cor + texto + ícone de ponto (nunca apenas cor). */
export function StatusPill({ tone, children, pulse }: { tone: Tone; children: ReactNode; pulse?: boolean }) {
  return (
    <span className={clsx('inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold', toneClasses[tone])}>
      <span className={clsx('size-2 shrink-0 rounded-full', dotClasses[tone], pulse && 'pulse-dot')} aria-hidden />
      <span className="truncate">{children}</span>
    </span>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return <span className={clsx('inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide', toneClasses[tone])}>{children}</span>;
}

export function Stat({ label, value, hint, icon, tone }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: Tone }) {
  return (
    <div className="card flex min-w-0 flex-col gap-1 p-4">
      <div className="flex items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-slate-400">
        <span className="truncate">{label}</span>
        {icon && <span className={clsx('shrink-0', tone === 'ok' ? 'text-green-400' : tone === 'warn' ? 'text-amber-400' : 'text-blue-400')}>{icon}</span>}
      </div>
      <div className="truncate text-2xl font-bold text-white tabular-nums">{value}</div>
      {hint && <div className="truncate text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center">
      {icon && <div className="text-slate-500">{icon}</div>}
      <h3 className="font-semibold text-slate-200">{title}</h3>
      {description && <p className="max-w-md text-sm text-slate-400">{description}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-lg bg-white/5', className)} aria-hidden />;
}

export function Spinner({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 text-sm text-slate-400">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

/* ---------------- Formulários ---------------- */
export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-slate-200">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-slate-400">{hint}</p>}
      {error && (
        <p className="text-xs text-red-300" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const inputBase =
  'min-h-11 w-full rounded-xl border border-line-strong bg-ink-850 px-3 text-[16px] sm:text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/30 disabled:opacity-60';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={clsx(inputBase, className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={clsx(inputBase, 'pr-8', className)} {...rest}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={clsx(inputBase, 'min-h-24 py-2', className)} {...rest} />;
});

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-slate-200">
          {label}
        </label>
        {description && <p className="text-xs text-slate-400">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx('relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition', checked ? 'border-brand bg-brand' : 'border-line-strong bg-ink-700')}
      >
        <span className={clsx('inline-block size-5 rounded-full bg-white shadow transition', checked ? 'translate-x-6' : 'translate-x-1')} />
        <span className="sr-only">{checked ? 'Ativado' : 'Desativado'}</span>
      </button>
    </div>
  );
}

/* ---------------- Abas ---------------- */
export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: Array<{ value: T; label: string }> }) {
  return (
    <div role="tablist" className="scrollbar-thin -mx-1 mb-4 flex gap-1 overflow-x-auto px-1">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={clsx('min-h-10 shrink-0 rounded-lg px-3 text-sm font-medium transition', value === it.value ? 'bg-brand-soft text-blue-200' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200')}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Modal (dialog nativo: foco preso e ESC por padrão) ---------------- */
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={clsx(
        'm-0 mt-auto w-full max-w-none rounded-t-2xl border border-line-strong bg-ink-850 p-0 text-slate-100 sm:m-auto sm:rounded-2xl',
        wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
      )}
      aria-labelledby="modal-title"
    >
      {open && (
        <div className="flex max-h-[90dvh] flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
            <h2 id="modal-title" className="text-base font-semibold">
              {title}
            </h2>
            <button onClick={onClose} className="grid size-10 place-items-center rounded-lg text-slate-400 hover:bg-white/5" aria-label="Fechar">
              <X className="size-5" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="safe-bottom flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

/* ---------------- Confirmação para ações destrutivas ---------------- */
interface ConfirmState {
  request: { title: string; message: string; confirmLabel: string; danger: boolean; resolve: (v: boolean) => void } | null;
}
const useConfirmStore = create<ConfirmState>(() => ({ request: null }));

export function confirmAction(opts: { title: string; message: string; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    useConfirmStore.setState({ request: { title: opts.title, message: opts.message, confirmLabel: opts.confirmLabel ?? 'Confirmar', danger: opts.danger ?? true, resolve } });
  });
}

export function ConfirmHost() {
  const req = useConfirmStore((s) => s.request);
  const close = (v: boolean) => {
    req?.resolve(v);
    useConfirmStore.setState({ request: null });
  };
  return (
    <Modal
      open={!!req}
      onClose={() => close(false)}
      title={req?.title ?? ''}
      footer={
        <>
          <Button variant="secondary" onClick={() => close(false)}>
            Cancelar
          </Button>
          <Button variant={req?.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
            {req?.confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-300">{req?.message}</p>
    </Modal>
  );
}

/* ---------------- Notificações (toasts) ---------------- */
interface Toast {
  id: number;
  tone: 'ok' | 'bad' | 'info' | 'warn';
  text: string;
}
const useToasts = create<{ items: Toast[] }>(() => ({ items: [] }));
let toastSeq = 1;

export function toast(text: string, tone: Toast['tone'] = 'ok'): void {
  const id = toastSeq++;
  useToasts.setState((s) => ({ items: [...s.items.slice(-3), { id, tone, text }] }));
  setTimeout(() => useToasts.setState((s) => ({ items: s.items.filter((t) => t.id !== id) })), tone === 'bad' ? 7000 : 4000);
}

export function ToastHost() {
  const items = useToasts((s) => s.items);
  const icons = { ok: CheckCircle2, bad: XCircle, info: Info, warn: AlertTriangle };
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:right-6 md:left-auto md:items-end">
      {items.map((t) => {
        const Icon = icons[t.tone];
        return (
          <div key={t.id} className={clsx('card pointer-events-auto flex w-full max-w-sm items-start gap-2 px-4 py-3 text-sm', t.tone === 'bad' && 'border-bad/40')}>
            <Icon className={clsx('mt-0.5 size-4 shrink-0', t.tone === 'ok' ? 'text-green-400' : t.tone === 'bad' ? 'text-red-400' : t.tone === 'warn' ? 'text-amber-400' : 'text-blue-400')} aria-hidden />
            <span className="text-slate-100">{t.text}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Copiar para a área de transferência ---------------- */
export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <Input readOnly value={value} onFocus={(e) => e.currentTarget.select()} aria-label={label} />
        <Button
          variant="secondary"
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? 'Copiado!' : 'Copiar'}
        </Button>
      </div>
    </Field>
  );
}
