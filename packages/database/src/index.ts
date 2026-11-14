import { PrismaClient, Prisma } from '@prisma/client';

export * from '@prisma/client';
export { tenantScope, assertTenantOwned } from './tenant';

let client: PrismaClient | undefined;

/**
 * Cliente Prisma único por processo. Cada serviço (api, worker, runner…)
 * possui seu próprio pool de conexões, limitado via `connection_limit` na URL.
 */
export function getPrisma(): PrismaClient {
  if (!client) {
    client = new PrismaClient({
      log: process.env.PRISMA_LOG === 'query' ? ['query', 'warn', 'error'] : ['warn', 'error'],
    });
  }
  return client;
}

export async function disconnectPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}

export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

export function isNotFound(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025';
}

/** Converte objetos arbitrários para JSON aceito pelo Prisma. */
export function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}
