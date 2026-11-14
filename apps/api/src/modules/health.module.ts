import { Controller, Get, Module, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { registry } from '@live-arena/observability';
import { redisHealthy } from '@live-arena/runtime';
import { Public } from '../common/auth';
import { Infra } from '../common/infra';
import { env } from '../common/env';

@Controller('health')
export class HealthController {
  constructor(private readonly infra: Infra) {}

  @Public()
  @Get('live')
  live() {
    return { status: 'ok', uptime: Math.round(process.uptime()) };
  }

  @Public()
  @Get('ready')
  async ready(@Res() res: Response) {
    const [db, redis] = await Promise.all([
      this.infra.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      redisHealthy(this.infra.redis),
    ]);
    const ok = db && redis;
    res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'fail', checks: { database: db, redis } });
  }
}

@Controller('metrics')
export class MetricsController {
  @Public()
  @Get()
  async metrics(@Req() req: Request, @Res() res: Response) {
    const token = env().METRICS_TOKEN;
    if (token && req.headers.authorization !== `Bearer ${token}`) {
      res.status(401).end();
      return;
    }
    res.setHeader('content-type', registry.contentType);
    res.send(await registry.metrics());
  }
}

@Module({ controllers: [HealthController, MetricsController] })
export class HealthModule {}
