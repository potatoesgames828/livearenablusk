/* Seed idempotente: planos e catálogo de jogos. Usuários administradores
 * são criados pelo script scripts/create-admin.mjs (nunca com senha fixa). */
import { DEFAULT_PLANS, GAME_CATALOG } from '@live-arena/shared';
import { getPrisma, disconnectPrisma, toJson } from './index';

export async function seedBaseData(): Promise<void> {
  const prisma = getPrisma();
  let order = 0;
  for (const plan of DEFAULT_PLANS) {
    const existing = await prisma.subscriptionPlan.findUnique({ where: { code: plan.code } });
    // Não sobrescreve limites já editados por administradores: só acrescenta chaves novas.
    const merged = existing ? { ...plan.limits, ...(existing.limits as Record<string, unknown>) } : plan.limits;
    await prisma.subscriptionPlan.upsert({
      where: { code: plan.code },
      create: { code: plan.code, name: plan.name, priceCents: plan.priceCents, limits: toJson(plan.limits), sortOrder: order++ },
      update: { name: plan.name, limits: toJson(merged) },
    });
  }
  for (const g of GAME_CATALOG) {
    await prisma.game.upsert({
      where: { id: g.id },
      create: { id: g.id, name: g.name, description: g.description, sortOrder: g.sortOrder },
      update: { name: g.name, description: g.description, sortOrder: g.sortOrder },
    });
  }
}

if (require.main === module) {
  seedBaseData()
    .then(() => {
      console.log('Seed concluído: planos e jogos.');
    })
    .catch((err: unknown) => {
      console.error('Falha no seed', err);
      process.exitCode = 1;
    })
    .finally(() => void disconnectPrisma());
}
