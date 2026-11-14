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
  // Larguras pedidas: 360, 390, 430, 768, 1024, 1366 e 1920 (+ iPhone SE 320 como caso extremo).
  projects: [
    { name: 'w1920', use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } } },
    { name: 'w1366', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } },
    { name: 'w1024-tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
    { name: 'w768-tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
    { name: 'w430-phone', use: { ...devices['Pixel 7'], viewport: { width: 430, height: 932 } } },
    { name: 'w390-iphone13', use: chromiumOnly(devices['iPhone 13']) },
    { name: 'w360-android', use: { ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 } } },
    { name: 'iphone-se', use: chromiumOnly(devices['iPhone SE']) },
    ...(all
      ? [
          { name: 'firefox-desktop', use: { ...devices['Desktop Firefox'] } },
          { name: 'safari-desktop', use: { ...devices['Desktop Safari'] } },
        ]
      : []),
  ],
});
