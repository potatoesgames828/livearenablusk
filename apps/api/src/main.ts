import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { initMetrics, initTracing, startEventLoopMonitor, createLogger } from '@live-arena/observability';
import { serviceIdentity, startHeartbeat, createRedis } from '@live-arena/runtime';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/http';
import { env } from './common/env';

export async function createApp(): Promise<NestExpressApplication> {
  const e = env();
  const logger = createLogger('api');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error', 'warn'], bodyParser: false });
  app.set('trust proxy', process.env.TRUST_PROXY ?? 'loopback');
  app.disable('x-powered-by');
  app.useBodyParser('json', { limit: '256kb' });
  app.use(cookieParser());
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
      hsts: e.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
    }),
  );
  const origins = e.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  app.enableCors({
    origin: (origin, cb) => cb(null, !origin || origins.includes(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['content-type', 'authorization', 'x-requested-with', 'x-request-id'],
    maxAge: 600,
  });
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter(logger));
  app.enableShutdownHooks();
  return app;
}

async function bootstrap(): Promise<void> {
  await initTracing('api');
  initMetrics('api');
  const logger = createLogger('api');
  const app = await createApp();
  const e = env();
  const hbRedis = createRedis('api-heartbeat');
  const stopHb = startHeartbeat(hbRedis, serviceIdentity('api'), () => ({ port: e.API_PORT }));
  startEventLoopMonitor((lag) => logger.warn({ lagMs: Math.round(lag) }, 'event loop lento'));
  await app.listen(e.API_PORT, e.API_HOST);
  logger.info({ port: e.API_PORT }, 'API pronta');
  const shutdown = async () => {
    await stopHb();
    hbRedis.disconnect();
    await app.close();
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());
}

if (require.main === module) {
  bootstrap().catch((err: unknown) => {
    console.error('Falha ao iniciar a API', err);
    process.exit(1);
  });
}
