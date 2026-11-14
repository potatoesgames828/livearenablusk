import type { PlatformRoleName, TenantRoleName } from './tokens';

/**
 * RBAC em dois níveis:
 *  - Papel no tenant (OWNER/ADMIN/MEMBER): o que a pessoa pode fazer no próprio espaço.
 *  - Papel na plataforma (USER/OPERATOR/ADMIN): acesso à administração interna.
 * As permissões são versionadas em código para serem auditáveis em revisão.
 */
export const PERMISSIONS = [
  'session:read',
  'session:control',
  'session:manage',
  'game:read',
  'game:configure',
  'event:read',
  'event:simulate',
  'overlay:manage',
  'stream:manage',
  'connection:manage',
  'automation:manage',
  'stats:read',
  'tenant:manage',
  'admin:read',
  'admin:users',
  'admin:plans',
  'admin:alerts',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const TENANT_ROLE_PERMS: Record<TenantRoleName, Permission[]> = {
  OWNER: [
    'session:read', 'session:control', 'session:manage', 'game:read', 'game:configure',
    'event:read', 'event:simulate', 'overlay:manage', 'stream:manage', 'connection:manage',
    'automation:manage', 'stats:read', 'tenant:manage',
  ],
  ADMIN: [
    'session:read', 'session:control', 'session:manage', 'game:read', 'game:configure',
    'event:read', 'event:simulate', 'overlay:manage', 'stream:manage', 'connection:manage',
    'automation:manage', 'stats:read',
  ],
  MEMBER: ['session:read', 'session:control', 'game:read', 'event:read', 'event:simulate', 'stats:read'],
};

const PLATFORM_ROLE_PERMS: Record<PlatformRoleName, Permission[]> = {
  USER: [],
  OPERATOR: ['admin:read', 'admin:alerts'],
  ADMIN: ['admin:read', 'admin:alerts', 'admin:users', 'admin:plans'],
};

export function permissionsFor(trole: TenantRoleName, prole: PlatformRoleName): Set<Permission> {
  return new Set([...TENANT_ROLE_PERMS[trole], ...PLATFORM_ROLE_PERMS[prole]]);
}

export function can(trole: TenantRoleName, prole: PlatformRoleName, perm: Permission): boolean {
  return permissionsFor(trole, prole).has(perm);
}
