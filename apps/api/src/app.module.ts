import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { InfraModule } from './common/infra';
import { AuthGuard } from './common/auth';
import { RateLimitGuard } from './common/rate-limit';
import { RequestContextMiddleware } from './common/http';
import { AuthModule } from './modules/auth.module';
import { GamesModule } from './modules/games.module';
import { ConnectionsModule } from './modules/connections.module';
import { SessionsModule } from './modules/sessions.module';
import { OverlaysModule } from './modules/overlays.module';
import { StreamsModule } from './modules/streams.module';
import { AutomationsModule } from './modules/automations.module';
import { StatsModule } from './modules/stats.module';
import { AdminModule } from './modules/admin.module';
import { HealthModule } from './modules/health.module';
import { MediaModule } from './modules/media.module';
import { AccountModule } from './modules/account.module';

@Module({
  imports: [
    InfraModule,
    AuthModule,
    GamesModule,
    MediaModule,
    AccountModule,
    ConnectionsModule,
    SessionsModule,
    OverlaysModule,
    StreamsModule,
    AutomationsModule,
    StatsModule,
    AdminModule,
    HealthModule,
  ],
  providers: [
    // Ordem: autenticação primeiro (para o rate limit por usuário), depois rate limit.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*path');
  }
}
