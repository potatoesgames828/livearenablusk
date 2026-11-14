#!/usr/bin/env node
/**
 * Verificação de licenças das dependências de produção.
 * Falha se encontrar licenças com obrigações incompatíveis com um SaaS fechado
 * (GPL/AGPL/SSPL/BUSL…) ou licença desconhecida não revisada.
 * A biblioteca tiktok-live-connector (AGPL c/ exceções) NÃO é dependência
 * instalada — é opcional e documentada em docs/LICENSE_AUDIT.md.
 */
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const DENY = /\b(AGPL|GPL|LGPL|SSPL|BUSL|Commons-Clause|CC-BY-NC)/i;
// Revisadas manualmente (licenças permissivas com nomes não padronizados).
const REVIEWED = new Map([
  ['thirty-two', 'Texto de licença MIT no repositório (falta só o campo no package.json). Usado pelo otplib.'],
  ['@img/sharp-libvips-linux-x64', 'LGPL: biblioteca dinâmica, não modificada e substituível; opcional do Next (otimização de imagens desativada: images.unoptimized).'],
  ['@img/sharp-libvips-linuxmusl-x64', 'Idem acima.'],
]);

const raw = execSync('pnpm licenses list --prod --json', { maxBuffer: 64 * 1024 * 1024 }).toString();
const data = JSON.parse(raw);
const summary = {};
const problems = [];
for (const [license, pkgs] of Object.entries(data)) {
  summary[license] = pkgs.length;
  for (const p of pkgs) {
    if (REVIEWED.has(p.name)) continue;
    if (DENY.test(license) && !/^(MIT|Apache|BSD|ISC)/i.test(license.split(' OR ')[0] ?? '')) problems.push(`${p.name}@${p.versions?.join(',')} — ${license}`);
    if (/unknown|UNLICENSED/i.test(license)) problems.push(`${p.name} — licença desconhecida`);
  }
}
mkdirSync('reports', { recursive: true });
writeFileSync('reports/licenses.json', JSON.stringify(summary, null, 2));
console.log('Licenças (produção):', Object.entries(summary).sort((a, b) => b[1] - a[1]).map(([l, n]) => `${l}: ${n}`).join(' | '));
if (problems.length) {
  console.error('\nLicenças que exigem revisão:\n' + problems.map((p) => ` - ${p}`).join('\n'));
  process.exit(1);
}
console.log('OK: nenhuma licença copyleft forte ou desconhecida nas dependências de produção.');
