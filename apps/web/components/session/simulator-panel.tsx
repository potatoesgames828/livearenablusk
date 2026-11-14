'use client';
import { useState } from 'react';
import { Gift, Heart, MessageCircle, UserPlus, Share2, Users, Zap, CloudLightning, PlugZap, Bug, Layers } from 'lucide-react';
import { Button, Field, Input, Select, confirmAction, toast } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

type SimType = 'GIFT' | 'LIKE' | 'CHAT' | 'FOLLOW' | 'SHARE' | 'MEMBER';

/** Live Event Simulator: eventos e cenários (inclusive falhas) sem uma LIVE real. */
export function SimulatorPanel({ sessionId, commands, disabled }: { sessionId: string; commands: string[]; disabled?: boolean }) {
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [custom, setCustom] = useState({ type: 'GIFT' as SimType, count: 5, diamondValue: 1, comment: commands[0] ?? '!join', streak: false });

  async function send(key: string, body: Record<string, unknown>) {
    setBusy(key);
    try {
      const r = await api<{ queued: number; dropped: number }>(`/sessions/${sessionId}/simulate`, { method: 'POST', body: { username: username || undefined, ...body } });
      toast(`${r.queued} evento(s) simulado(s) enviado(s)${r.dropped ? ` · ${r.dropped} descartado(s) por sobrecarga` : ''}.`, 'info');
    } catch (err) {
      toast(errorMessage(err), 'bad');
    } finally {
      setBusy(null);
    }
  }

  async function scenario(name: string, label: string, destructive = false) {
    if (destructive && !(await confirmAction({ title: label, message: 'Este cenário provoca uma falha controlada para testar a recuperação automática. O jogo pode congelar por alguns segundos.', confirmLabel: 'Executar teste', danger: false }))) return;
    setBusy(name);
    try {
      const r = await api<{ queued?: number; message?: string }>(`/sessions/${sessionId}/scenario`, { method: 'POST', body: { scenario: name } });
      toast(r.message ?? `Cenário iniciado: ${r.queued ?? 0} eventos.`, 'info');
    } catch (err) {
      toast(errorMessage(err), 'bad');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {disabled && <p className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-amber-200">Inicie a sessão para usar o simulador.</p>}
      <Field label="Espectador fictício (opcional)" htmlFor="sim-user" hint="Deixe vazio para nomes aleatórios.">
        <Input id="sim-user" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={24} placeholder="ex.: ana_gamer" />
      </Field>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Button variant="secondary" disabled={disabled} loading={busy === 'g1'} icon={<Gift className="size-4 text-pink-400" />} onClick={() => void send('g1', { type: 'GIFT', count: 1, giftId: '5655' })}>Rosa (1💎)</Button>
        <Button variant="secondary" disabled={disabled} loading={busy === 'g2'} icon={<Gift className="size-4 text-amber-400" />} onClick={() => void send('g2', { type: 'GIFT', count: 1, giftId: '6267' })}>Corgi (299💎)</Button>
        <Button variant="secondary" disabled={disabled} loading={busy === 'g3'} icon={<Layers className="size-4 text-violet-400" />} onClick={() => void send('g3', { type: 'GIFT', count: 10, streak: true, giftId: '5655' })}>Sequência x10</Button>
        <Button variant="secondary" disabled={disabled} loading={busy === 'l1'} icon={<Heart className="size-4 text-red-400" />} onClick={() => void send('l1', { type: 'LIKE', count: 100 })}>+100 curtidas</Button>
        <Button variant="secondary" disabled={disabled} loading={busy === 'l2'} icon={<Heart className="size-4 text-red-500" />} onClick={() => void send('l2', { type: 'LIKE', count: 1000, spreadMs: 3000 })}>Pico 1000</Button>
        <Button variant="secondary" disabled={disabled} loading={busy === 'f'} icon={<UserPlus className="size-4 text-green-400" />} onClick={() => void send('f', { type: 'FOLLOW', count: 1 })}>Seguidor</Button>
        <Button variant="secondary" disabled={disabled} loading={busy === 's'} icon={<Share2 className="size-4 text-cyan-400" />} onClick={() => void send('s', { type: 'SHARE', count: 1 })}>Compartilhar</Button>
        <Button variant="secondary" disabled={disabled} loading={busy === 'm'} icon={<Users className="size-4 text-slate-300" />} onClick={() => void send('m', { type: 'MEMBER', count: 10 })}>10 entradas</Button>
      </div>
      {commands.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-slate-300">Comandos de comentário deste jogo</p>
          <div className="flex flex-wrap gap-2">
            {commands.map((c) => (
              <Button key={c} size="sm" variant="ghost" className="border border-line-strong" disabled={disabled} icon={<MessageCircle className="size-3.5" />} onClick={() => void send(`c${c}`, { type: 'CHAT', count: 1, comment: c })}>
                {c}
              </Button>
            ))}
          </div>
        </div>
      )}
      <details className="rounded-xl border border-line p-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-200">Evento personalizado</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Tipo" htmlFor="sim-type">
            <Select id="sim-type" value={custom.type} onChange={(e) => setCustom({ ...custom, type: e.target.value as SimType })}>
              <option value="GIFT">Presente</option>
              <option value="LIKE">Curtidas</option>
              <option value="CHAT">Comentário</option>
              <option value="FOLLOW">Seguidor</option>
              <option value="SHARE">Compartilhamento</option>
              <option value="MEMBER">Entrada</option>
            </Select>
          </Field>
          <Field label="Quantidade" htmlFor="sim-count">
            <Input id="sim-count" type="number" min={1} max={5000} value={custom.count} onChange={(e) => setCustom({ ...custom, count: Number(e.target.value) })} />
          </Field>
          {custom.type === 'GIFT' && (
            <Field label="Diamantes por presente" htmlFor="sim-dia">
              <Input id="sim-dia" type="number" min={0} value={custom.diamondValue} onChange={(e) => setCustom({ ...custom, diamondValue: Number(e.target.value) })} />
            </Field>
          )}
          {custom.type === 'CHAT' && (
            <Field label="Comentário" htmlFor="sim-comment">
              <Input id="sim-comment" value={custom.comment} onChange={(e) => setCustom({ ...custom, comment: e.target.value })} maxLength={200} />
            </Field>
          )}
          <div className="sm:col-span-2">
            <Button
              disabled={disabled}
              loading={busy === 'custom'}
              icon={<Zap className="size-4" />}
              onClick={() =>
                void send('custom', {
                  type: custom.type,
                  count: custom.count,
                  diamondValue: custom.type === 'GIFT' ? custom.diamondValue : undefined,
                  comment: custom.type === 'CHAT' ? custom.comment : undefined,
                })
              }
            >
              Enviar
            </Button>
          </div>
        </div>
      </details>
      <div>
        <p className="mb-2 text-sm font-medium text-slate-300">Cenários prontos</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button variant="secondary" disabled={disabled} loading={busy === 'basic'} onClick={() => void scenario('basic', 'Básico')}>Básico: 500 curtidas, 5 presentes</Button>
          <Button variant="secondary" disabled={disabled} loading={busy === 'storm'} icon={<CloudLightning className="size-4" />} onClick={() => void scenario('storm', 'Tempestade')}>Tempestade: 1000 curtidas + 20 presentes</Button>
          <Button variant="secondary" disabled={disabled} loading={busy === 'connector-drop'} icon={<PlugZap className="size-4" />} onClick={() => void scenario('connector-drop', 'Queda da fonte de eventos', true)}>Simular queda da conexão</Button>
          <Button variant="secondary" disabled={disabled} loading={busy === 'runner-crash'} icon={<Bug className="size-4" />} onClick={() => void scenario('runner-crash', 'Falha no processo do jogo', true)}>Simular falha do jogo</Button>
        </div>
      </div>
    </div>
  );
}
