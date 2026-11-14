import { defineConfig, devices } from '@playwright/test';

/**
 * Testes E2E multiplataforma. Neste ambiente somente o Chromium está
 * instalado; perfis de iPhone/iPad usam emulação (viewport, toque, DPR, UA)
 * no Chromium. Para validar no WebKit/Safari e Firefox reais, rode com
 * `npx playwright install webkit firefox` e PW_ALL_BROWSERS=1.
 */
const BASE_URL = process.env.WEB_URL ?? 'http://localhost:3000';
const all = process.env.PW_ALL_BROWSERS === '1';
const chromiumOnly = (d: (typeof devices)[string]) => (all ? d : { ...d, browserName: 'chromium' as const, defaultBrowserType: 'chromium' as const });

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: { baseURL: BASE_URL, trace: 'off', screenshot: 'only-on-failure', locale: 'pt-BR' },
  projects: [
    { name: 'desktop-1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'notebook-1280', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
    { name: 'tablet-ipad-retrato', use: chromiumOnly(devices['iPad (gen 7)']) },
    { name: 'tablet-ipad-paisagem', use: chromiumOnly(devices['iPad (gen 7) landscape']) },
    { name: 'tablet-android', use: { ...devices['Galaxy Tab S4'] } },
    { name: 'iphone-13', use: chromiumOnly(devices['iPhone 13']) },
    { name: 'iphone-se', use: chromiumOnly(devices['iPhone SE']) },
    { name: 'android-pixel-7', use: { ...devices['Pixel 7'] } },
    ...(all
      ? [
          { name: 'firefox-desktop', use: { ...devices['Desktop Firefox'] } },
          { name: 'safari-desktop', use: { ...devices['Desktop Safari'] } },
        ]
      : []),
  ],
});
