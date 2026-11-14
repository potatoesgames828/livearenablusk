import type { ProviderId, TikTokConnectorAdapter } from './adapter';
import { SimulatorAdapter, type DemoLoad } from './simulator';
import { TtlcAdapter } from './ttlc';
import { EulerStreamAdapter } from './euler';

export * from './adapter';
export * from './circuit-breaker';
export * from './simulator';
export * from './webcast-mapping';
export { TtlcAdapter, EulerStreamAdapter };

/** Fábrica de adaptadores — único ponto que conhece as implementações. */
export function createAdapter(provider: ProviderId, opts: { demoLoad?: DemoLoad | null } = {}): TikTokConnectorAdapter {
  switch (provider) {
    case 'SIMULATOR':
      return new SimulatorAdapter(opts.demoLoad ?? null);
    case 'TIKTOK_TTLC':
      return new TtlcAdapter();
    case 'EULER_STREAM':
      return new EulerStreamAdapter();
  }
}

/** Quais provedores estão habilitados neste servidor (exibido no painel). */
export function availableProviders(): Array<{ id: ProviderId; enabled: boolean; note: string }> {
  return [
    { id: 'SIMULATOR', enabled: true, note: 'Eventos simulados para testes e demonstração.' },
    {
      id: 'EULER_STREAM',
      enabled: Boolean(process.env.EULER_WS_URL),
      note: 'Serviço gerenciado com contrato (requer API key do cliente ou da plataforma).',
    },
    {
      id: 'TIKTOK_TTLC',
      enabled: TtlcAdapter.isEnabled(),
      note: 'Biblioteca open source (AGPL-3.0 c/ exceções). Desabilitada por padrão por restrições de licença para SaaS.',
    },
  ];
}
