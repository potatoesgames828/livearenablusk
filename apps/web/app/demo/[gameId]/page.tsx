'use client';
import Link from 'next/link';
import { use, useMemo, useState } from 'react';
import { defaultConfigFor } from '@live-arena/game-engine';
import { getGameModule } from '@live-arena/games';
import { GAME_CATALOG } from '@live-arena/shared';
import { Logo } from '@/components/brand';
import { GameCanvas } from '@/components/game-canvas';
import { DemoControls } from '@/components/demo-controls';
import { Badge, Card, Tabs } from '@/components/ui';
import { useLocalGame } from '@/lib/local-game';

export default function DemoPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = use(params);
  const mod = getGameModule(gameId);
  const [aspect, setAspect] = useState<'vertical' | 'horizontal'>('vertical');
  const config = useMemo(() => (mod ? { ...defaultConfigFor(mod.manifest), aspect } : null), [mod, aspect]);
  const game = useLocalGame(mod ? gameId : null, config);
  if (!mod || !config) {
    return (
      <main className="app-backdrop grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <p className="text-slate-300">Jogo não encontrado.</p>
          <Link href="/" className="text-blue-300">Voltar</Link>
        </div>
      </main>
    );
  }
  const commands = config.rules.flatMap((r) => (r.trigger.kind === 'CHAT_COMMAND' ? [r.trigger.command] : []));
  return (
    <main className="app-backdrop min-h-dvh">
      <header className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4">
        <Logo />
        <Link href="/cadastro" className="min-h-11 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white">
          Criar conta
        </Link>
      </header>
      <div className="mx-auto grid max-w-7xl gap-4 px-4 pb-10 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-white">
              {mod.manifest.emoji} {mod.manifest.name}
            </h1>
            <Badge tone="warn">Demonstração local — dados simulados</Badge>
          </div>
          <Tabs value={aspect} onChange={setAspect} items={[{ value: 'vertical', label: 'Vertical 9:16' }, { value: 'horizontal', label: 'Horizontal 16:9' }]} />
          <div className="card overflow-hidden p-0">
            <div className={aspect === 'vertical' ? 'mx-auto aspect-[9/16] max-h-[78dvh] w-full max-w-[min(100%,44dvh)]' : 'aspect-video w-full'}>
              <GameCanvas key={aspect} onReady={game.attach} />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <Card title="Simule o público" subtitle="Cada botão gera um evento fictício que passa pelas regras padrão do jogo.">
            <DemoControls onFire={game.fire} onControl={game.control} commands={commands} />
          </Card>
          <Card title="Como o público joga">
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-300">
              {mod.manifest.howToPlay.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </Card>
          <Card title="Outros jogos">
            <div className="flex flex-wrap gap-2">
              {GAME_CATALOG.filter((g) => g.id !== gameId).map((g) => (
                <Link key={g.id} href={`/demo/${g.id}`} className="min-h-10 rounded-lg border border-line-strong px-3 py-2 text-sm text-slate-200 hover:bg-white/5">
                  {g.name}
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}
