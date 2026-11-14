'use client';
import { Radio, Gamepad2, Clapperboard, PlugZap } from 'lucide-react';
import { formatDuration } from '@live-arena/shared';
import { useEffect, useState } from 'react';
import { StatusPill } from '@/components/ui';
import {
  connectorTone, labelConnector, labelRunner, labelSession, labelStream, runnerTone, sessionTone, streamTone,
} from '@/lib/format';
import type { Session } from '@/lib/types';

function Item({ icon, title, children, help }: { icon: React.ReactNode; title: string; children: React.ReactNode; help?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-line bg-white/[0.02] p-2.5 sm:gap-2 sm:p-3">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-400">
        {icon}
        {title}
      </div>
      <div>{children}</div>
      {help && <p className="line-clamp-2 text-xs text-slate-400">{help}</p>}
    </div>
  );
}

/**
 * Mostra separadamente os 4 componentes independentes da sessão
 * (ciclo de vida, fonte de eventos, jogo e transmissão), para a pessoa
 * entender exatamente onde está um problema.
 */
export function StatusBoard({ session }: { session: Session }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const running = session.startedAt && !['STOPPED', 'IDLE'].includes(session.state);
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
      <Item icon={<Radio className="size-4" aria-hidden />} title="Sessão" help={running ? `Tempo: ${formatDuration(now - new Date(session.startedAt!).getTime())}` : undefined}>
        <StatusPill tone={sessionTone(session.state)} pulse={session.state === 'RUNNING'}>
          {labelSession(session.state)}
        </StatusPill>
      </Item>
      <Item
        icon={<PlugZap className="size-4" aria-hidden />}
        title="Fonte de eventos"
        help={session.connection ? `${session.connection.label}${session.connection.tiktokUsername ? ` · @${session.connection.tiktokUsername}` : ''}` : 'Use o simulador para testar.'}
      >
        <StatusPill tone={connectorTone(session.connectorState)}>{labelConnector(session.connectorState)}</StatusPill>
      </Item>
      <Item icon={<Gamepad2 className="size-4" aria-hidden />} title="Jogo" help={session.gameConfig.name}>
        <StatusPill tone={runnerTone(session.runnerState)}>{labelRunner(session.runnerState)}</StatusPill>
      </Item>
      <Item
        icon={<Clapperboard className="size-4" aria-hidden />}
        title="Transmissão"
        help={session.streamStats?.fps ? `${session.streamStats.fps.toFixed(0)} fps · ${Math.round(session.streamStats.bitrateKbps ?? 0)} kbps` : session.streamState === 'NOT_CONFIGURED' ? 'Use o link de overlay no OBS.' : undefined}
      >
        <StatusPill tone={streamTone(session.streamState)}>{labelStream(session.streamState)}</StatusPill>
      </Item>
    </div>
  );
}
