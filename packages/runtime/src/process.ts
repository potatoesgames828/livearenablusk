import type { Logger } from '@live-arena/observability';

type Cleanup = () => Promise<void> | void;

/**
 * Encerramento gracioso: em SIGTERM/SIGINT executa as rotinas de limpeza
 * (liberar leases, fechar filas, salvar checkpoints) com tempo limite.
 * Exceções não tratadas são registradas e o processo reinicia de forma
 * controlada (o supervisor — Docker/systemd — sobe outra instância).
 */
export function installProcessHandlers(logger: Logger, cleanups: Cleanup[], timeoutMs = 10_000): void {
  let shuttingDown = false;
  const shutdown = async (reason: string, code = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ reason }, 'encerrando processo');
    const timer = setTimeout(() => {
      logger.error('tempo de encerramento excedido; forçando saída');
      process.exit(code || 1);
    }, timeoutMs);
    timer.unref();
    for (const c of cleanups) {
      try {
        await c();
      } catch (err) {
        logger.error({ err }, 'falha em rotina de encerramento');
      }
    }
    process.exit(code);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (err) => {
    logger.error({ err }, 'promise rejeitada sem tratamento');
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'exceção não tratada; reiniciando de forma controlada');
    void shutdown('uncaughtException', 1);
  });
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  return v;
}
