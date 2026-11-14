import type { GameConfigBody, LiveEvent } from '@live-arena/shared';
import type { GameModule, GameSimulation, LiveGamePlugin } from './types';

/**
 * Adapta uma `GameSimulation` ao contrato `LiveGamePlugin` exigido pela
 * plataforma. Útil para testes isolados de jogos e para o modo demonstração,
 * em que eventos brutos são convertidos em ações pelas regras padrão.
 */
export class GameHost implements LiveGamePlugin<unknown> {
  readonly id: string;
  readonly name: string;
  private sim: GameSimulation | null = null;
  private config: GameConfigBody | null = null;
  private eventHandler: ((sim: GameSimulation, ev: LiveEvent) => void) | null = null;

  constructor(
    private readonly mod: GameModule,
    private readonly seed = 1,
    private readonly simulated = true,
  ) {
    this.id = mod.manifest.id;
    this.name = mod.manifest.name;
  }

  /** Define como eventos brutos viram ações (normalmente o Event Engine). */
  onEvent(handler: (sim: GameSimulation, ev: LiveEvent) => void): void {
    this.eventHandler = handler;
  }

  async initialize(config: GameConfigBody): Promise<void> {
    this.config = config;
    this.sim = this.mod.create({ seed: this.seed, config, simulated: this.simulated });
    this.sim.control('STOP');
  }

  private get s(): GameSimulation {
    if (!this.sim) throw new Error('jogo não inicializado');
    return this.sim;
  }

  async start(): Promise<void> {
    this.s.control('START');
  }
  async pause(): Promise<void> {
    this.s.control('PAUSE');
  }
  async resume(): Promise<void> {
    this.s.control('RESUME');
  }
  async stop(): Promise<void> {
    this.s.control('STOP');
  }
  async reset(): Promise<void> {
    if (!this.config) throw new Error('jogo não inicializado');
    await this.initialize(this.config);
    await this.start();
  }
  async handleEvent(event: LiveEvent): Promise<void> {
    this.eventHandler?.(this.s, event);
  }
  async getState(): Promise<unknown> {
    return this.s.snapshot();
  }

  /** Avança a simulação (usado por testes e pelo runner). */
  step(dt: number): void {
    this.s.tick(dt);
  }

  get simulation(): GameSimulation {
    return this.s;
  }
}
