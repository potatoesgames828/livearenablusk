// Gera um bundle IIFE (window.LA) com todos os jogos para demos/artefatos e revisão visual.
// Uso: node scripts/demo-bundle/build.mjs <saida.js>
import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const dir = readdirSync(path.join(root, 'node_modules/.pnpm')).find((d) => /^esbuild@\d/.test(d));
const require = createRequire(path.join(root, 'node_modules/.pnpm', dir, 'node_modules/esbuild/package.json'));
const esbuild = require('esbuild');
const out = process.argv[2] ?? path.join(root, 'scripts/demo-bundle/la.js');
await esbuild.build({ entryPoints: [path.join(root, 'scripts/demo-bundle/entry.ts')], bundle: true, format: 'iife', minify: true, outfile: out, nodePaths: [path.join(root, 'apps/web/node_modules'), path.join(root, 'packages/games-catalog/node_modules')], logLevel: 'warning' });
console.log('bundle:', out);
