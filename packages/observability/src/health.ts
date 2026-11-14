import http from 'node:http';
import { registry } from './metrics';

export type CheckFn = () => Promise<boolean> | boolean;

export interface HealthServerOptions {
  port: number;
  host?: string;
  /** Verificações de prontidão (dependências: Redis, banco…). */
  readiness?: Record<string, CheckFn>;
  /** Verificações de vivacidade (o processo não travou). */
  liveness?: Record<string, CheckFn>;
  /** Token opcional exigido em /metrics (Authorization: Bearer). */
  metricsToken?: string;
}

async function runChecks(checks: Record<string, CheckFn> = {}): Promise<{ ok: boolean; checks: Record<string, boolean> }> {
  const results: Record<string, boolean> = {};
  await Promise.all(
    Object.entries(checks).map(async ([name, fn]) => {
      try {
        results[name] = await Promise.race([
          Promise.resolve(fn()),
          new Promise<boolean>((r) => setTimeout(() => r(false), 2000)),
        ]);
      } catch {
        results[name] = false;
      }
    }),
  );
  return { ok: Object.values(results).every(Boolean), checks: results };
}

/**
 * Servidor HTTP mínimo para processos sem HTTP próprio (worker, runner, connector…):
 *   GET /health/live   → liveness
 *   GET /health/ready  → readiness
 *   GET /metrics       → Prometheus
 * Escuta em 127.0.0.1 por padrão (não deve ser exposto publicamente).
 */
export function startHealthServer(opts: HealthServerOptions): http.Server {
  const server = http.createServer((req, res) => {
    void (async () => {
      const url = req.url ?? '/';
      if (url.startsWith('/health/live')) {
        const r = await runChecks(opts.liveness);
        res.writeHead(r.ok ? 200 : 503, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: r.ok ? 'ok' : 'fail', ...r }));
        return;
      }
      if (url.startsWith('/health/ready') || url === '/health') {
        const r = await runChecks(opts.readiness);
        res.writeHead(r.ok ? 200 : 503, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: r.ok ? 'ok' : 'fail', ...r }));
        return;
      }
      if (url.startsWith('/metrics')) {
        if (opts.metricsToken && req.headers.authorization !== `Bearer ${opts.metricsToken}`) {
          res.writeHead(401).end();
          return;
        }
        res.writeHead(200, { 'content-type': registry.contentType });
        res.end(await registry.metrics());
        return;
      }
      res.writeHead(404).end();
    })().catch(() => {
      res.writeHead(500).end();
    });
  });
  server.listen(opts.port, opts.host ?? process.env.HEALTH_HOST ?? '127.0.0.1');
  return server;
}
