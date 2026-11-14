'use client';
import clsx from 'clsx';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard, Radio, Gamepad2, Workflow, ListTree, MonitorPlay, BarChart3, Trophy, Settings, LifeBuoy, LogOut, MoreHorizontal, Shield, X, ChevronsLeft, ChevronsRight,
  SlidersHorizontal, History, Music, Bell, CreditCard,
} from 'lucide-react';
import { BRAND } from '@live-arena/shared';
import { Logo } from './brand';
import { Spinner } from './ui';
import { api, refreshSession, useAuth } from '@/lib/api';

const NAV = [
  { href: '/painel', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/painel/jogos', label: 'Biblioteca de jogos', icon: Gamepad2 },
  { href: '/painel/lives', label: 'Minha transmissão', icon: Radio },
  { href: '/painel/mapeamento', label: 'Configuração de eventos', icon: SlidersHorizontal },
  { href: '/painel/overlays', label: 'Overlay', icon: MonitorPlay },
  { href: '/painel/estatisticas', label: 'Estatísticas', icon: BarChart3 },
  { href: '/painel/historico', label: 'Histórico', icon: History },
  { href: '/painel/sons', label: 'Soundboard', icon: Music },
  { href: '/painel/alertas', label: 'Alertas', icon: Bell },
  { href: '/painel/automacoes', label: 'Automações', icon: Workflow },
  { href: '/painel/ranking', label: 'Ranking', icon: Trophy },
  { href: '/painel/eventos', label: 'Feed de eventos', icon: ListTree },
  { href: '/painel/configuracoes', label: 'Conta', icon: Settings },
  { href: '/painel/assinatura', label: 'Assinatura', icon: CreditCard },
  { href: '/painel/ajuda', label: 'Central de ajuda', icon: LifeBuoy },
];
// No celular: 4 atalhos principais + "Mais".
const MOBILE_PRIMARY = ['/painel', '/painel/lives', '/painel/jogos', '/painel/overlays'];
const MOBILE_LABELS: Record<string, string> = { '/painel': 'Início', '/painel/lives': 'LIVE', '/painel/jogos': 'Jogos', '/painel/overlays': 'Overlay' };

function useActive() {
  const path = usePathname();
  return (href: string, exact?: boolean) => (exact ? path === href : path === href || path.startsWith(`${href}/`));
}

/** Garante sessão autenticada; restaura a partir do cookie de refresh. */
export function useRequireAuth() {
  const router = useRouter();
  const path = usePathname();
  const { token, ready } = useAuth();
  useEffect(() => {
    if (ready) return;
    void (async () => {
      if (!useAuth.getState().token) await refreshSession();
      useAuth.getState().setReady();
    })();
  }, [ready]);
  useEffect(() => {
    if (ready && !token) router.replace(`/entrar?next=${encodeURIComponent(path)}`);
  }, [ready, token, router, path]);
  return ready && !!token;
}

async function logout() {
  await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
  useAuth.getState().setSession(null, null);
  window.location.href = '/entrar';
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const ok = useRequireAuth();
  const user = useAuth((s) => s.user);
  const isActive = useActive();
  const [moreOpen, setMoreOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const path = usePathname();
  useEffect(() => setMoreOpen(false), [path]);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem('la:sidebar') === 'collapsed');
    } catch {
      /* armazenamento indisponível */
    }
  }, []);
  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem('la:sidebar', c ? 'expanded' : 'collapsed');
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

  if (!ok)
    return (
      <div className="app-backdrop grid min-h-dvh place-items-center">
        <Spinner label="Abrindo seu painel…" />
      </div>
    );

  const isAdmin = user?.platformRole === 'ADMIN' || user?.platformRole === 'OPERATOR';

  return (
    <div className="app-backdrop min-h-dvh">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-3 focus:py-2">
        Pular para o conteúdo
      </a>
      {/* Menu lateral: trilho de ícones no tablet, expansível no desktop */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-line bg-ink-950/80 backdrop-blur md:flex',
          collapsed ? 'w-[76px]' : 'w-[76px] lg:w-64',
        )}
        aria-label="Menu principal"
      >
        <div className="flex h-16 items-center px-5">
          <span className={clsx(collapsed ? '' : 'lg:hidden')}>
            <Logo compact />
          </span>
          <span className={clsx('hidden', !collapsed && 'lg:block')}>
            <Logo />
          </span>
        </div>
        <nav className="scrollbar-thin flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {NAV.map(({ href, label, icon: Icon, exact }) => (
            <Link
              key={href}
              href={href}
              title={label}
              aria-current={isActive(href, exact) ? 'page' : undefined}
              className={clsx(
                'flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition',
                isActive(href, exact) ? 'bg-brand-soft text-blue-100' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100',
              )}
            >
              <Icon className="size-5 shrink-0" aria-hidden />
              <span className={clsx('truncate', collapsed ? 'sr-only' : 'sr-only lg:not-sr-only')}>{label}</span>
            </Link>
          ))}
          {isAdmin && (
            <Link href="/admin" title="Administração" className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-amber-300 hover:bg-white/5">
              <Shield className="size-5 shrink-0" aria-hidden />
              <span className={clsx(collapsed ? 'sr-only' : 'sr-only lg:not-sr-only')}>Administração</span>
            </Link>
          )}
        </nav>
        <div className="space-y-1 border-t border-line p-3">
          <div className={clsx('px-3 pb-2', collapsed ? 'hidden' : 'hidden lg:block')}>
            <p className="truncate text-sm font-semibold text-slate-100">{user?.name}</p>
            <p className="truncate text-xs text-slate-400">
              {user?.tenant?.name} · plano {user?.plan?.name ?? user?.tenant?.planCode}
            </p>
          </div>
          <button onClick={toggle} className="hidden min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm text-slate-400 hover:bg-white/5 lg:flex" aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}>
            {collapsed ? <ChevronsRight className="size-5" aria-hidden /> : <ChevronsLeft className="size-5" aria-hidden />}
            <span className={clsx(collapsed && 'sr-only')}>Recolher</span>
          </button>
          <button onClick={() => void logout()} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm text-slate-400 hover:bg-white/5" title="Sair">
            <LogOut className="size-5" aria-hidden />
            <span className={clsx(collapsed ? 'sr-only' : 'sr-only lg:not-sr-only')}>Sair</span>
          </button>
        </div>
      </aside>

      {/* Topo no celular */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-ink-950/85 px-4 backdrop-blur md:hidden">
        <Logo />
        <span className="max-w-[45%] truncate text-xs text-slate-400">{user?.tenant?.name}</span>
      </header>

      <main id="conteudo" className={clsx('px-4 pb-28 pt-5 sm:px-6 md:pb-10 md:pt-8', collapsed ? 'md:pl-[100px]' : 'md:pl-[100px] lg:pl-[290px]', 'lg:pr-8')}>
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>

      {/* Navegação inferior no celular */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ink-950/95 backdrop-blur md:hidden" aria-label="Navegação principal">
        <div className="grid grid-cols-5">
          {NAV.filter((n) => MOBILE_PRIMARY.includes(n.href)).map(({ href, label, icon: Icon, exact }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href, exact) ? 'page' : undefined}
              className={clsx('flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium', isActive(href, exact) ? 'text-blue-300' : 'text-slate-400')}
            >
              <Icon className="size-5" aria-hidden />
              <span className="max-w-full truncate px-1">{MOBILE_LABELS[href] ?? label}</span>
            </Link>
          ))}
          <button onClick={() => setMoreOpen(true)} className="flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-slate-400" aria-haspopup="dialog" aria-expanded={moreOpen}>
            <MoreHorizontal className="size-5" aria-hidden />
            Mais
          </button>
        </div>
      </nav>

      {/* Folha "Mais" no celular */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Mais opções">
          <button className="absolute inset-0 bg-black/60" onClick={() => setMoreOpen(false)} aria-label="Fechar" />
          <div className="safe-bottom absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-line-strong bg-ink-850 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="font-semibold text-white">{user?.name}</p>
                <p className="text-xs text-slate-400">{BRAND.name} · plano {user?.plan?.name ?? user?.tenant?.planCode}</p>
              </div>
              <button onClick={() => setMoreOpen(false)} className="grid size-11 place-items-center rounded-xl text-slate-300" aria-label="Fechar">
                <X className="size-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[...NAV.filter((n) => !MOBILE_PRIMARY.includes(n.href)), ...(isAdmin ? [{ href: '/admin', label: 'Admin', icon: Shield }] : [])].map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl bg-white/5 p-2 text-center text-xs font-medium text-slate-200">
                  <Icon className="size-5" aria-hidden />
                  {label}
                </Link>
              ))}
              <button onClick={() => void logout()} className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl bg-white/5 p-2 text-xs font-medium text-slate-200">
                <LogOut className="size-5" aria-hidden />
                Sair
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
