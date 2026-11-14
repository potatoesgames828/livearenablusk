import Link from 'next/link';
import { BRAND, GAME_CATALOG } from '@live-arena/shared';
import { Gift, Heart, MessageCircle, Smartphone, Monitor, Tablet, ShieldCheck, Activity, Gamepad2 } from 'lucide-react';
import { Logo } from '@/components/brand';

const emojis: Record<string, string> = { 'snake-live': '🐍', 'battle-arena': '⚔️', 'avatar-race': '🏁', 'plinko-live': '🔮', 'survival-arena': '🛡️' };

export default function Home() {
  return (
    <main className="app-backdrop min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link href="/entrar" className="min-h-11 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/5">
            Entrar
          </Link>
          <Link href="/cadastro" className="min-h-11 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-strong">
            Criar conta
          </Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-6 md:grid-cols-2 md:pt-16">
        <div>
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-line-strong bg-white/5 px-3 py-1 text-xs font-semibold text-blue-200">
            <Activity className="size-3.5" aria-hidden /> Jogos interativos para TikTok LIVE
          </p>
          <h1 className="text-4xl font-black leading-tight tracking-tight text-white sm:text-5xl">{BRAND.tagline}.</h1>
          <p className="mt-4 max-w-xl text-base text-slate-300 sm:text-lg">
            Presentes, curtidas e comentários do seu público controlam jogos em tempo real. Configure sem programar, teste com o simulador e transmita pelo OBS.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/cadastro" className="min-h-12 rounded-xl bg-brand px-6 py-3 font-semibold text-white hover:bg-brand-strong">
              Começar grátis
            </Link>
            <Link href="/demo/snake-live" className="min-h-12 rounded-xl border border-line-strong bg-ink-700 px-6 py-3 font-semibold text-slate-100 hover:bg-ink-600">
              Testar um jogo agora
            </Link>
          </div>
          <ul className="mt-8 flex flex-wrap gap-4 text-sm text-slate-400">
            <li className="flex items-center gap-1.5"><Gift className="size-4 text-pink-400" aria-hidden /> Presentes viram ações</li>
            <li className="flex items-center gap-1.5"><Heart className="size-4 text-red-400" aria-hidden /> Metas de curtidas</li>
            <li className="flex items-center gap-1.5"><MessageCircle className="size-4 text-blue-400" aria-hidden /> Comandos no chat</li>
          </ul>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {GAME_CATALOG.map((g) => (
            <Link key={g.id} href={`/demo/${g.id}`} className="card group p-4 transition hover:border-brand/50">
              <div className="text-3xl" aria-hidden>{emojis[g.id]}</div>
              <h2 className="mt-2 font-bold text-white group-hover:text-blue-200">{g.name}</h2>
              <p className="mt-1 line-clamp-3 text-xs text-slate-400">{g.description}</p>
            </Link>
          ))}
          <div className="card flex flex-col justify-center p-4">
            <Gamepad2 className="size-6 text-violet-400" aria-hidden />
            <p className="mt-2 text-sm font-semibold text-white">Modo demonstração</p>
            <p className="text-xs text-slate-400">Experimente qualquer jogo direto no navegador.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { icon: Monitor, title: 'PC e notebook', text: 'Painel completo com monitoramento, estatísticas e integração com OBS.' },
            { icon: Smartphone, title: 'Celular', text: 'Controle a LIVE, use o simulador e acompanhe eventos pelo telefone.' },
            { icon: Tablet, title: 'Tablet', text: 'Layout em duas colunas para pré-visualizar o jogo e controlar ao mesmo tempo.' },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="card p-5">
              <Icon className="size-6 text-blue-400" aria-hidden />
              <h3 className="mt-3 font-semibold text-white">{title}</h3>
              <p className="mt-1 text-sm text-slate-400">{text}</p>
            </div>
          ))}
        </div>
        <p className="mt-10 flex items-center justify-center gap-2 text-center text-xs text-slate-500">
          <ShieldCheck className="size-4" aria-hidden /> {BRAND.name} não é afiliada ao TikTok. Integrações usam apenas meios autorizados; jogos com pontuação exclusivamente virtual.
        </p>
      </section>
    </main>
  );
}
