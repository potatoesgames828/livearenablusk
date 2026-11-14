import { Global, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { getPrisma, disconnectPrisma, type PrismaClient } from '@live-arena/database';
import { createRedis, getQueue, closeQueues, QUEUES, type Redis } from '@live-arena/runtime';
import { createLogger, type Logger } from '@live-arena/observability';
import type { Queue } from 'bullmq';

@Injectable()
export class Infra implements OnModuleDestroy {
  readonly prisma: PrismaClient = getPrisma();
  readonly redis: Redis = createRedis('api');
  /** Conexão dedicada às filas (opções específicas do BullMQ). */
  readonly queueRedis: Redis = createRedis('api-queue', { forQueue: true });
  readonly logger: Logger = createLogger('api');

  queue(name: (typeof QUEUES)[keyof typeof QUEUES]): Queue {
    return getQueue(name, this.queueRedis);
  }

  async onModuleDestroy(): Promise<void> {
    await closeQueues();
    this.redis.disconnect();
    this.queueRedis.disconnect();
    await disconnectPrisma();
  }
}

@Global()
@Module({ providers: [Infra], exports: [Infra] })
export class InfraModule {}
