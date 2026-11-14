import type { CatalogEntry } from '@live-arena/shared';
import type { GameManifest } from '@live-arena/game-engine';
import type { GameConfigBody } from '@live-arena/shared';

export interface CatalogGame extends GameManifest {
  allowed: boolean;
  defaultConfig: GameConfigBody;
  meta: CatalogEntry | null;
  favorite: boolean;
}

export interface GameConfig {
  id: string;
  gameId: string;
  name: string;
  body: GameConfigBody;
  isPreset: boolean;
  version: number;
  updatedAt: string;
}

export interface Connection {
  id: string;
  label: string;
  provider: 'SIMULATOR' | 'TIKTOK_TTLC' | 'EULER_STREAM';
  tiktokUsername: string | null;
  hasCredentials: boolean;
  config: { demoLoad?: 'off' | 'light' | 'busy' };
}

export interface StreamConfig {
  id: string;
  name: string;
  mode: 'OBS' | 'RTMP' | 'RECORD';
  rtmpUrl: string | null;
  streamKeyMasked: string | null;
  width: number;
  height: number;
  fps: number;
  videoBitrateKbps: number;
  audioBitrateKbps: number;
}

export interface Session {
  id: string;
  name: string;
  state: string;
  connectorState: string;
  runnerState: string;
  streamState: string;
  demo: boolean;
  autoMode: boolean;
  lastError: string | null;
  startedAt: string | null;
  endedAt: string | null;
  gameConfigId: string;
  connectionId: string | null;
  streamConfigId: string | null;
  gameConfig: { id: string; name: string; gameId: string };
  connection: { id: string; label: string; provider: string; tiktokUsername: string | null } | null;
  counters: Record<string, number>;
  streamStats: { fps?: number; bitrateKbps?: number; health?: string; restarts?: number; target?: string } | null;
  availableActions: Array<'start' | 'pause' | 'resume' | 'stop'>;
}

export interface Provider {
  id: Connection['provider'];
  enabled: boolean;
  note: string;
}
