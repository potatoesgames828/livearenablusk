/**
 * Utilitários de isolamento multi-tenant.
 *
 * Toda consulta de aplicação deve passar pelo `tenantScope`, que injeta o
 * tenantId no filtro. Assim um ID enviado pelo frontend nunca é suficiente
 * para acessar um registro de outro tenant: o filtro composto retorna vazio
 * e a API responde 404 (sem revelar a existência do recurso).
 */
export function tenantScope<T extends Record<string, unknown>>(
  tenantId: string,
  where?: T,
): T & { tenantId: string } {
  if (!tenantId) throw new Error('tenantScope: tenantId obrigatório');
  return { ...(where ?? ({} as T)), tenantId };
}

export class TenantAccessError extends Error {
  constructor() {
    super('Recurso não pertence ao tenant');
    this.name = 'TenantAccessError';
  }
}

/** Garante que um registro carregado pertence ao tenant esperado. */
export function assertTenantOwned<T extends { tenantId: string } | null | undefined>(
  record: T,
  tenantId: string,
): asserts record is NonNullable<T> {
  if (!record || record.tenantId !== tenantId) throw new TenantAccessError();
}
