#!/usr/bin/env node
/**
 * Promove uma conta existente a administrador/operador da plataforma.
 * Nunca cria senhas fixas: a pessoa se cadastra normalmente e depois é promovida.
 *
 *   node scripts/create-admin.mjs email@dominio.com [ADMIN|OPERATOR]
 *
 * Requer DATABASE_URL (lido do .env se existir). Registra a ação na auditoria.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const [email, role = 'ADMIN'] = process.argv.slice(2);
if (!email || !['ADMIN', 'OPERATOR', 'USER'].includes(role)) {
  console.error('Uso: node scripts/create-admin.mjs email@dominio.com [ADMIN|OPERATOR|USER]');
  process.exit(1);
}
const { getPrisma } = require('../packages/database/dist/index.js');
const prisma = getPrisma();
const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
if (!user) {
  console.error('Conta não encontrada. Cadastre-se primeiro pelo site e rode de novo.');
  process.exit(1);
}
await prisma.user.update({ where: { id: user.id }, data: { platformRole: role } });
await prisma.auditLog.create({ data: { actorId: null, action: 'admin.role_change_cli', targetType: 'User', targetId: user.id, metadata: { role } } });
console.log(`${email} agora tem o papel ${role}. Recomendado: ative a verificação em duas etapas (MFA) em Configurações.`);
await prisma.$disconnect();
