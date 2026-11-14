'use client';
import { useState } from 'react';
import { Gift, Heart, MessageCircle, UserPlus, Share2, Pause, Play, RotateCcw } from 'lucide-react';
import { Button, Field, Input } from './ui';
import type { DemoEvent } from '@/lib/local-game';

/** Botões grandes (toque) para disparar eventos de demonstração locais. */
export function DemoControls({ onFire, onControl, commands }: { onFire: (e: DemoEvent, user?: string) => void; onControl: (c: 'PAUSE' | 'RESUME' | 'RESET_ROUND') => void; commands: string[] }) {
  const [user, setUser] = useState('');
  const [paused, setPaused] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <Field label="Nome do espectador fictício (opcional)" htmlFor="demo-user">
        <Input id="demo-user" value={user} onChange={(e) => setUser(e.target.value)} placeholder="aleatório" maxLength={24} />
      </Field>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Button variant="secondary" icon={<Gift className="size-4 text-pink-400" />} onClick={() => onFire({ type: 'GIFT', diamonds: 1 }, user)}>
          Presente (1💎)
        </Button>
        <Button variant="secondary" icon={<Gift className="size-4 text-amber-400" />} onClick={() => onFire({ type: 'GIFT', diamonds: 500, quantity: 1 }, user)}>
          Presente grande
        </Button>
        <Button variant="secondary" icon={<Gift className="size-4 text-violet-400" />} onClick={() => onFire({ type: 'GIFT', diamonds: 1, quantity: 10 }, user)}>
          10 presentes
        </Button>
        <Button variant="secondary" icon={<Heart className="size-4 text-red-400" />} onClick={() => onFire({ type: 'LIKE', count: 100 }, user)}>
          +100 curtidas
        </Button>
        <Button variant="secondary" icon={<Heart className="size-4 text-red-500" />} onClick={() => onFire({ type: 'LIKE', count: 1000 }, user)}>
          +1000 curtidas
        </Button>
        <Button variant="secondary" icon={<UserPlus className="size-4 text-green-400" />} onClick={() => onFire({ type: 'FOLLOW' }, user)}>
          Seguidor
        </Button>
        <Button variant="secondary" icon={<Share2 className="size-4 text-cyan-400" />} onClick={() => onFire({ type: 'SHARE' }, user)}>
          Compartilhar
        </Button>
      </div>
      {commands.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-slate-300">Comandos de comentário</p>
          <div className="flex flex-wrap gap-2">
            {commands.map((c) => (
              <Button key={c} size="sm" variant="ghost" className="border border-line-strong" icon={<MessageCircle className="size-3.5" />} onClick={() => onFire({ type: 'CHAT', comment: c }, user)}>
                {c}
              </Button>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <Button
          variant="secondary"
          size="sm"
          icon={paused ? <Play className="size-4" /> : <Pause className="size-4" />}
          onClick={() => {
            onControl(paused ? 'RESUME' : 'PAUSE');
            setPaused(!paused);
          }}
        >
          {paused ? 'Retomar' : 'Pausar'}
        </Button>
        <Button variant="secondary" size="sm" icon={<RotateCcw className="size-4" />} onClick={() => onControl('RESET_ROUND')}>
          Reiniciar rodada
        </Button>
      </div>
    </div>
  );
}
