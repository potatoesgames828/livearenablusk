/**
 * TEMPLATE DE JOGO — copie esta pasta para criar um novo jogo.
 *
 * 1. Renomeie o pacote em package.json e o id no manifesto.
 * 2. Adicione o id em packages/shared/src/catalog.ts (GAME_CATALOG).
 * 3. Registre o módulo em packages/games-catalog/src/index.ts e render.ts.
 * 4. Rode `pnpm build:packages` e `pnpm db:seed`.
 *
 * Este exemplo ("Contador Coletivo") é propositalmente simples: cada
 * presente enche uma barra; quando enche, a rodada termina.
 */
import type { GameActionMessage } from '@live-arena/shared';
import { BaseGame, type BaseSnapshot, type GameManifest, type GameModule, type SimContext } from '@live-arena/game-engine';

export const manifest: GameManifest = {
  id: 'game-template',
  name: 'Contador Coletivo (template)',
  description: 'Exemplo mínimo de jogo para desenvolvedores.',
  howToPlay: ['Presentes enchem a barra.', 'Quando a barra enche, a rodada termina.'],
  accent: '#64748b',
  emoji: '🧩',
  settings: [{ key: 'goal', label: 'Meta', type: 'number', default: 100, min: 1, max: 100000 }],
  actions: [{ id: 'add', label: 'Adicionar', description: 'Soma pontos na barra.', params: [{ key: 'amount', label: 'Quantidade', type: 'number', default: 10 }] }],
  defaultRules: [{ id: 'gift-add', trigger: { kind: 'GIFT' }, action: 'add', params: { amount: 10 } }],
};

interface St {
  value: number;
}
export interface TemplateSnapshot extends BaseSnapshot {
  value: number;
  goal: number;
}

export class TemplateGame extends BaseGame<TemplateSnapshot, St> {
  protected st: St = { value: 0 };
  constructor(ctx: SimContext) {
    super(manifest, ctx);
  }
  protected update(): void {
    if (this.st.value >= this.num('goal')) {
      const top = this.leaderboard(1, true)[0];
      this.endRound(top ? { id: top.id, name: top.name } : undefined, { value: this.st.value });
    }
  }
  protected onAction(a: GameActionMessage, q: number): void {
    if (a.actionId === 'add') {
      const n = this.param(a, 'amount', 10) * q;
      this.st.value += n;
      this.addScore(a.viewer, n, 'template');
    }
  }
  protected resetRound(): void {
    this.st.value = 0;
  }
  snapshot(): TemplateSnapshot {
    return { ...this.baseSnapshot(), value: this.st.value, goal: this.num('goal') };
  }
}

export const gameModule: GameModule = { manifest, create: (ctx) => new TemplateGame(ctx) };
