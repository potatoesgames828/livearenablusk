'use client';
import { create } from 'zustand';
import type { ApiErrorBody } from '@live-arena/shared';

export interface Me {
  id: string;
  email: string;
  name: string;
  platformRole: 'USER' | 'OPERATOR' | 'ADMIN';
  mfaEnabled: boolean;
  mfaVerified?: boolean;
  tenant: { id: string; name: string; slug: string; planCode: string; role: string } | null;
  tenants: Array<{ id: string; name: string; role: string }>;
  permissions: string[];
  plan?: { code: string; name: string; limits: Record<string, unknown> };
}

interface AuthState {
  token: string | null;
  user: Me | null;
  ready: boolean;
  setSession(token: string | null, user?: Me | null): void;
  setReady(): void;
}

/** O access token fica apenas em memória (nunca em localStorage). */
export const useAuth = create<AuthState>((set) => ({
  token: null,
  user: null,
  ready: false,
  setSession: (token, user) => set((s) => ({ token, user: user === undefined ? s.user : user })),
  setReady: () => set({ ready: true }),
}));

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

let refreshing: Promise<boolean> | null = null;

/** Renova o access token usando o cookie httpOnly (rotação no servidor). */
export async function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const res = await fetch('/api/auth/refresh', { method: 'POST', headers: { 'x-requested-with': 'live-arena' }, credentials: 'same-origin' });
      if (!res.ok) {
        useAuth.getState().setSession(null, null);
        return false;
      }
      const body = (await res.json()) as { accessToken: string; user: Me };
      useAuth.getState().setSession(body.accessToken, body.user);
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => {
        refreshing = null;
      }, 0);
    }
  })();
  return refreshing;
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; retry?: boolean } = {}): Promise<T> {
  const token = useAuth.getState().token;
  const res = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      'x-requested-with': 'live-arena',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    credentials: 'same-origin',
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (res.status === 401 && init.retry !== false && !path.startsWith('/auth/login')) {
    if (await refreshSession()) return api<T>(path, { ...init, retry: false });
  }
  if (!res.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      /* sem corpo */
    }
    throw new ApiError(res.status, body?.error.code ?? 'INTERNAL', body?.error.message ?? 'Não foi possível concluir a ação. Verifique sua conexão.', body?.error.details);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Algo deu errado.';
}

export function hasPerm(user: Me | null, perm: string): boolean {
  return !!user?.permissions.includes(perm);
}
