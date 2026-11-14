import { BRAND } from '@live-arena/shared';
import Link from 'next/link';

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 font-black tracking-tight text-white" aria-label={BRAND.name}>
      <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 shadow-[0_8px_24px_-8px_rgba(99,102,241,0.9)]">
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
          <path d="M5 4l14 8-14 8z" fill="white" />
        </svg>
      </span>
      {!compact && <span className="text-lg">{BRAND.name}</span>}
    </Link>
  );
}

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <main className="app-backdrop flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="card p-6 sm:p-8">
          <h1 className="text-xl font-bold text-white">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-6 text-center text-sm text-slate-400">{footer}</div>}
      </div>
    </main>
  );
}
