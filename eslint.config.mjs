import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**', 'coverage/**', 'playwright-report/**', 'test-results/**', 'reports/**', 'apps/web/public/sw.js', '**/*.d.ts', 'apps/web/next-env.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: false }],
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['**/*.{mjs,cjs,js}'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly', fetch: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly', URL: 'readonly', Buffer: 'readonly', __ENV: 'readonly', __VU: 'readonly', __ITER: 'readonly', self: 'readonly', caches: 'readonly', location: 'readonly', require: 'readonly', module: 'readonly' } },
  },
);
