import type {
  ControlCommand,
  EventRuleInput,
  GameActionMessage,
  GameConfigBody,
  LiveEvent,
  ViewerSignalMessage,
} from '@live-arena/shared';

export type Aspect = 'vertical' | 'horizontal';

export interface ParamDef {
  key: string;
  label: string;
  type: 'number' | 'boolean' | 'select' | 'text';
  default: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ value: string; label: string }>;
  help?: string;
  unit?: string;
}

export interface ActionDef {
  id: string;
  label: string;
  description: string;
  params: ParamDef[];
}

export interface GameManifest {
  id: string;
  name: string;
  description: string;
  /** Texto curto explicando como o público interage. */
  howToPlay: string[];
  actions: ActionDef[];
  settings: ParamDef[];
  defaultRules: EventRuleInput[];
  /** Cor de destaque do jogo na interface. */
  accent: string;
  emoji: string;
}

export interface ViewerRef {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface FxMarker {
  id: number;
  kind: string;
  x: number;
  y: number;
  color?: string;
  text?: string;
  size?: number;
}

export interface Notice {
  id: number;
  text: string;
  color: string;
  until: number;
}

export interface LeaderEntry {
  id: string;
  name: string;
  score: number;
}

/** Campos comuns presentes em todo snapshot enviado ao renderer. */
export interface BaseSnapshot {
  gameId: string;
  aspect: Aspect;
  width: number;
  height: number;
  t: number;
  round: number;
  phase: 'playing' | 'intermission' | 'paused' | 'stopped';
  phaseEndsIn?: number;
  leaderboard: LeaderEntry[];
  notices: Array<{ id: number; text: string; color: string }>;
  fx: FxMarker[];
  theme: { primary: string; secondary: string; background: string };
  simulated: boolean;
}

/** Eventos de domínio produzidos pelo jogo (persistência, automações, ranking). */
export type GameDomainEvent =
  | { type: 'score'; viewer: ViewerRef; points: number; reason: string }
  | { type: 'participation'; viewer: ViewerRef }
  | { type: 'roundStart'; round: number }
  | { type: 'roundEnd'; round: number; winner?: ViewerRef & { score?: number }; summary: Record<string, unknown> }
  | { type: 'announce'; text: string };

export interface SimContext {
  seed: number;
  config: GameConfigBody;
  simulated: boolean;
}

/**
 * Simulação de um jogo. Roda no game-runner (servidor), é determinística a
 * partir da semente e pode ser serializada para checkpoint/recuperação.
 */
export interface GameSimulation<S extends BaseSnapshot = BaseSnapshot> {
  readonly manifest: GameManifest;
  tick(dt: number): void;
  applyAction(action: GameActionMessage): void;
  applySignal(signal: ViewerSignalMessage): void;
  control(command: ControlCommand, args?: Record<string, unknown>): void;
  snapshot(): S;
  /** Remove marcadores de efeito já publicados. */
  consumeFx(): void;
  drainEvents(): GameDomainEvent[];
  serialize(): unknown;
  restore(data: unknown): void;
}

export type SimulationFactory = (ctx: SimContext) => GameSimulation;

/**
 * Interface de plugin exigida pela plataforma. O `GameHost` implementa este
 * contrato sobre qualquer `GameSimulation`.
 */
export interface LiveGamePlugin<State = unknown> {
  id: string;
  name: string;
  initialize(config: GameConfigBody): Promise<void>;
  start(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  handleEvent(event: LiveEvent): Promise<void>;
  getState(): Promise<State>;
  reset(): Promise<void>;
}

export interface GameModule {
  manifest: GameManifest;
  create: SimulationFactory;
}
