'use client';
import clsx from 'clsx';
import { Gift, Heart, MessageCircle, UserPlus, Share2, Users, Zap } from 'lucide-react';
import { Badge, EmptyState } from '@/components/ui';
import { EVENT_LABELS } from '@/lib/format';
import type { FeedItem } from '@/lib/realtime';

const ICONS: Record<string, typeof Gift> = { GIFT: Gift, LIKE: Heart, CHAT: MessageCircle, FOLLOW: UserPlus, SHARE: Share2, MEMBER: Users };
const COLORS: Record<string, string> = { GIFT: 'text-pink-400', LIKE: 'text-red-400', CHAT: 'text-blue-400', FOLLOW: 'text-green-400', SHARE: 'text-cyan-400', MEMBER: 'text-slate-400' };

export function LiveFeed({ items, compact }: { items: FeedItem[]; compact?: boolean }) {
  if (items.length === 0) return <EmptyState title="Nenhum evento ainda" description="Os eventos da LIVE (ou do simulador) aparecem aqui em tempo real." />;
  return (
    <ul className={clsx('scrollbar-thin flex flex-col gap-1.5 overflow-y-auto pr-1', compact ? 'max-h-72' : 'max-h-[480px]')} aria-live="polite" aria-relevant="additions">
      {items.map((e) => {
        const Icon = ICONS[e.type] ?? Zap;
        return (
          <li key={e.id} className="flex items-start gap-3 rounded-lg bg-white/[0.03] px-3 py-2">
            <Icon className={clsx('mt-0.5 size-4 shrink-0', COLORS[e.type] ?? 'text-slate-400')} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-slate-100">
                <span className="font-semibold">{e.user ?? EVENT_LABELS[e.type] ?? e.type}</span>
                {e.detail && <span className="text-slate-400"> · {e.detail}</span>}
              </p>
              <p className="text-[11px] text-slate-500">
                {EVENT_LABELS[e.type] ?? e.type}
                {e.actions > 0 && <span className="text-green-400"> · {e.actions} ação(ões) no jogo</span>}
                {e.throttled > 0 && <span className="text-amber-400"> · {e.throttled} em cooldown</span>}
              </p>
            </div>
            {e.simulated && <Badge tone="warn">simulado</Badge>}
          </li>
        );
      })}
    </ul>
  );
}
