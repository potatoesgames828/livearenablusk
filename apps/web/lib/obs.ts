'use client';
import OBSWebSocket from 'obs-websocket-js';

/**
 * Integração com o OBS Studio do PRÓPRIO usuário via obs-websocket v5.
 * A conexão parte do navegador para o OBS local (ws://localhost:4455),
 * portanto funciona no PC onde o OBS está aberto. A senha nunca é enviada
 * aos nossos servidores.
 */
export class ObsBridge {
  private obs = new OBSWebSocket();
  connected = false;

  async connect(url: string, password?: string): Promise<{ obsVersion: string }> {
    const r = await this.obs.connect(url, password || undefined, { rpcVersion: 1 });
    this.connected = true;
    this.obs.once('ConnectionClosed', () => {
      this.connected = false;
    });
    return { obsVersion: r.obsWebSocketVersion };
  }

  async disconnect(): Promise<void> {
    await this.obs.disconnect();
    this.connected = false;
  }

  async scenes(): Promise<{ current: string; list: string[] }> {
    const r = await this.obs.call('GetSceneList');
    return { current: r.currentProgramSceneName, list: (r.scenes as Array<{ sceneName: string }>).map((s) => s.sceneName).reverse() };
  }

  /** Cria (ou atualiza) a fonte "LIVE ARENA" na cena escolhida com o link do overlay. */
  async upsertBrowserSource(scene: string, url: string, width: number, height: number, name = 'LIVE ARENA'): Promise<void> {
    const settings = { url, width, height, fps_custom: true, fps: 60, reroute_audio: true, shutdown: false, restart_when_active: false };
    const inputs = await this.obs.call('GetInputList');
    const exists = (inputs.inputs as Array<{ inputName: string }>).some((i) => i.inputName === name);
    if (exists) {
      await this.obs.call('SetInputSettings', { inputName: name, inputSettings: settings, overlay: true });
    } else {
      await this.obs.call('CreateInput', { sceneName: scene, inputName: name, inputKind: 'browser_source', inputSettings: settings, sceneItemEnabled: true });
    }
  }

  async setScene(scene: string): Promise<void> {
    await this.obs.call('SetCurrentProgramScene', { sceneName: scene });
  }

  async streamStatus(): Promise<{ active: boolean; reconnecting: boolean; skipped: number; total: number; congestion: number; durationMs: number; kbps?: number }> {
    const s = await this.obs.call('GetStreamStatus');
    return {
      active: s.outputActive,
      reconnecting: s.outputReconnecting,
      skipped: s.outputSkippedFrames,
      total: s.outputTotalFrames,
      congestion: s.outputCongestion,
      durationMs: s.outputDuration,
    };
  }

  async stats(): Promise<{ fps: number; cpu: number; renderSkipped: number; outputSkipped: number }> {
    const s = await this.obs.call('GetStats');
    return { fps: s.activeFps, cpu: s.cpuUsage, renderSkipped: s.renderSkippedFrames, outputSkipped: s.outputSkippedFrames };
  }

  async startStream(): Promise<void> {
    await this.obs.call('StartStream');
  }

  async stopStream(): Promise<void> {
    await this.obs.call('StopStream');
  }
}
