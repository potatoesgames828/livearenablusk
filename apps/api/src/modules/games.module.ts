import { Body, Controller, Delete, Get, HttpCode, Module, Param, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { catalogEntry, gameConfigBodySchema, isGameAllowed, type GameConfigBody } from '@live-arena/shared';
import { defaultConfigFor, validateConfigAgainstManifest } from '@live-arena/game-engine';
import { getGameModule, listManifests } from '@live-arena/games';
import { audit, keys, readSessionMeta, writeSessionMeta, sendControl } from '@live-arena/runtime';
import { toJson, tenantScope } from '@live-arena/database';
import { Auth, RequirePerm, type AuthContext } from '../common/auth';
import { ZodPipe } from '../common/http';
import { Errors } from '../common/errors';
import { Infra } from '../common/infra';
import { PlanService } from '../common/plans';
import { AuthModule } from './auth.module';

const createSchema = z.object({
  gameId: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(80),
  body: gameConfigBodySchema.optional(),
  isPreset: z.boolean().optional(),
});
const updateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  body: gameConfigBodySchema.optional(),
  isPreset: z.boolean().optional(),
});

@Controller('games')
export class GamesController {
  constructor(
    private readonly infra: Infra,
    private readonly plans: PlanService,
  ) {}

  /** Catálogo de jogos com manifesto (ações, configurações, regras padrão) e disponibilidade no plano. */
  @Get()
  @RequirePerm('game:read')
  async catalog(@Auth() auth: AuthContext) {
    const { limits } = await this.plans.limits(auth.tenantId);
    const enabled = new Set((await this.infra.prisma.game.findMany({ where: { enabled: true } })).map((g) => g.id));
    const favs = new Set((await this.infra.prisma.favoriteGame.findMany({ where: { tenantId: auth.tenantId, userId: auth.userId } })).map((f) => f.gameId));
    return listManifests()
      .filter((m) => enabled.has(m.id))
      .map((m) => ({ ...m, allowed: isGameAllowed(limits, m.id), defaultConfig: defaultConfigFor(m), meta: catalogEntry(m.id) ?? null, favorite: favs.has(m.id) }))
      .sort((a, b) => (a.meta?.sortOrder ?? 99) - (b.meta?.sortOrder ?? 99));
  }

  /** Favoritar / desfavoritar um jogo na biblioteca (por usuário). */
  @Post(':gameId/favorite')
  @HttpCode(200)
  @RequirePerm('game:read')
  async favorite(@Auth() auth: AuthContext, @Param('gameId') gameId: string) {
    if (!getGameModule(gameId)) throw Errors.notFound('Jogo não encontrado.');
    await this.infra.prisma.favoriteGame.upsert({
      where: { tenantId_userId_gameId: { tenantId: auth.tenantId, userId: auth.userId, gameId } },
      create: { tenantId: auth.tenantId, userId: auth.userId, gameId },
      update: {},
    });
    return { ok: true, favorite: true };
  }

  @Delete(':gameId/favorite')
  @RequirePerm('game:read')
  async unfavorite(@Auth() auth: AuthContext, @Param('gameId') gameId: string) {
    await this.infra.prisma.favoriteGame.deleteMany({ where: { tenantId: auth.tenantId, userId: auth.userId, gameId } });
    return { ok: true, favorite: false };
  }

  @Get('configs')
  @RequirePerm('game:read')
  async listConfigs(@Auth() auth: AuthContext) {
    return this.infra.prisma.gameConfiguration.findMany({ where: tenantScope(auth.tenantId), orderBy: { updatedAt: 'desc' } });
  }

  @Get('configs/:id')
  @RequirePerm('game:read')
  async getConfig(@Auth() auth: AuthContext, @Param('id') id: string) {
    const c = await this.infra.prisma.gameConfiguration.findFirst({ where: tenantScope(auth.tenantId, { id }) });
    if (!c) throw Errors.notFound();
    return c;
  }

  private validate(gameId: string, body: GameConfigBody): void {
    const mod = getGameModule(gameId);
    if (!mod) throw Errors.notFound('Jogo não encontrado.');
    const errors = validateConfigAgainstManifest(mod.manifest, body);
    if (errors.length) throw Errors.validation(errors.map((message) => ({ path: 'body', message })), errors[0]);
  }

  @Post('configs')
  @RequirePerm('game:configure')
  async create(@Auth() auth: AuthContext, @Body(new ZodPipe(createSchema)) input: z.infer<typeof createSchema>) {
    const mod = getGameModule(input.gameId);
    if (!mod) throw Errors.notFound('Jogo não encontrado.');
    await this.plans.assertGameAllowed(auth.tenantId, input.gameId);
    await this.plans.assertCount(auth.tenantId, 'maxGameConfigs', await this.infra.prisma.gameConfiguration.count({ where: { tenantId: auth.tenantId } }));
    const body = input.body ?? defaultConfigFor(mod.manifest);
    this.validate(input.gameId, body);
    const created = await this.infra.prisma.gameConfiguration.create({
      data: { tenantId: auth.tenantId, gameId: input.gameId, name: input.name, body: toJson(body), isPreset: input.isPreset ?? false },
    });
    await audit({ tenantId: auth.tenantId, actorId: auth.userId, action: 'game_config.create', targetType: 'GameConfiguration', targetId: created.id });
    return created;
  }

  @Put('configs/:id')
  @RequirePerm('game:configure')
  async update(@Auth() auth: AuthContext, @Param('id') id: string, @Body(new ZodPipe(updateSchema)) input: z.infer<typeof updateSchema>) {
    const existing = await this.infra.prisma.gameConfiguration.findFirst({ where: tenantScope(auth.tenantId, { id }) });
    if (!existing) throw Errors.notFound();
    if (input.body) this.validate(existing.gameId, input.body);
    const updated = await this.infra.prisma.gameConfiguration.update({
      where: { id },
      data: { name: input.name, isPreset: input.isPreset, body: input.body ? toJson(input.body) : undefined, version: { increment: 1 } },
    });
    // Propaga a nova configuração para sessões ativas que usam esta configuração.
    const active = await this.infra.prisma.liveSession.findMany({ where: { tenantId: auth.tenantId, gameConfigId: id }, select: { id: true } });
    for (const s of active) {
      const meta = await readSessionMeta(this.infra.redis, s.id);
      if (meta) {
        await writeSessionMeta(this.infra.redis, { ...meta, config: updated.body as unknown as GameConfigBody, version: Date.now() });
        await sendControl(this.infra.redis, s.id, 'SWITCH_GAME', { gameConfigId: id, reload: true }, auth.userId);
      }
    }
    await audit({ tenantId: auth.tenantId, actorId: auth.userId, action: 'game_config.update', targetType: 'GameConfiguration', targetId: id });
    return updated;
  }

  @Post('configs/:id/duplicate')
  @RequirePerm('game:configure')
  async duplicate(@Auth() auth: AuthContext, @Param('id') id: string) {
    const existing = await this.infra.prisma.gameConfiguration.findFirst({ where: tenantScope(auth.tenantId, { id }) });
    if (!existing) throw Errors.notFound();
    await this.plans.assertCount(auth.tenantId, 'maxGameConfigs', await this.infra.prisma.gameConfiguration.count({ where: { tenantId: auth.tenantId } }));
    return this.infra.prisma.gameConfiguration.create({
      data: { tenantId: auth.tenantId, gameId: existing.gameId, name: `${existing.name} (cópia)`.slice(0, 80), body: toJson(existing.body), isPreset: existing.isPreset },
    });
  }

  @Post('configs/:id/restore-defaults')
  @HttpCode(200)
  @RequirePerm('game:configure')
  async restore(@Auth() auth: AuthContext, @Param('id') id: string) {
    const existing = await this.infra.prisma.gameConfiguration.findFirst({ where: tenantScope(auth.tenantId, { id }) });
    if (!existing) throw Errors.notFound();
    const mod = getGameModule(existing.gameId);
    if (!mod) throw Errors.notFound();
    return this.infra.prisma.gameConfiguration.update({ where: { id }, data: { body: toJson(defaultConfigFor(mod.manifest)), version: { increment: 1 } } });
  }

  @Delete('configs/:id')
  @RequirePerm('game:configure')
  async remove(@Auth() auth: AuthContext, @Param('id') id: string) {
    const existing = await this.infra.prisma.gameConfiguration.findFirst({ where: tenantScope(auth.tenantId, { id }) });
    if (!existing) throw Errors.notFound();
    const inUse = await this.infra.prisma.liveSession.count({ where: { tenantId: auth.tenantId, gameConfigId: id } });
    if (inUse > 0) throw Errors.conflict('VALIDATION', 'Esta configuração está em uso por uma sessão. Troque o jogo da sessão antes de excluir.');
    await this.infra.prisma.gameConfiguration.delete({ where: { id } });
    await audit({ tenantId: auth.tenantId, actorId: auth.userId, action: 'game_config.delete', targetType: 'GameConfiguration', targetId: id });
    return { ok: true };
  }

  /** Último estado conhecido de um jogo de sessão (para pré-visualização inicial). */
  @Get('state/:sessionId')
  @RequirePerm('session:read')
  async lastState(@Auth() auth: AuthContext, @Param('sessionId') sessionId: string) {
    const s = await this.infra.prisma.liveSession.findFirst({ where: tenantScope(auth.tenantId, { id: sessionId }), select: { id: true } });
    if (!s) throw Errors.notFound();
    const raw = await this.infra.redis.get(keys.lastState(sessionId));
    return raw ? (JSON.parse(raw) as unknown) : null;
  }
}

@Module({ imports: [AuthModule], controllers: [GamesController] })
export class GamesModule {}
