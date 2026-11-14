import { execSync } from 'node:child_process';
import { expect, type Page } from '@playwright/test';

const API = process.env.API_URL ?? 'http://127.0.0.1:4000/api';
const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

export async function api<T = unknown>(token: string | null, method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip(), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${await r.text()}`);
  return (await r.json()) as T;
}

/** Cria conta pela API (setup rápido) e define o plano no banco de teste. */
export async function createAccount(plan = 'pro') {
  const email = `e2e.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`;
  const r = await api<{ accessToken: string; user: { tenant: { id: string } } }>(null, 'POST', '/auth/register', { name: 'Pessoa E2E', email, password: 'SenhaForte123', workspaceName: 'Canal E2E' });
  if (plan !== 'free') {
    const url = process.env.DATABASE_URL ?? 'postgresql://postgres:devpassword@127.0.0.1:5432/livearena';
    execSync(`psql "${url.split('?')[0]}" -qc "UPDATE \\"Tenant\\" SET \\"planCode\\"='${plan}' WHERE id='${r.user.tenant.id}'"`);
  }
  return { email, password: 'SenhaForte123', token: r.accessToken };
}

export async function loginUI(page: Page, email: string, password: string) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL(/\/painel/);
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'a página não deve ter rolagem horizontal').toBeLessThanOrEqual(1);
}

export const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1200) < 768;
