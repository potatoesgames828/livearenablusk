import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000';
const REALTIME_PUBLIC = process.env.NEXT_PUBLIC_REALTIME_URL ?? 'http://localhost:4001';
const realtimeWs = REALTIME_PUBLIC.replace(/^http/, 'ws');

// CSP: scripts inline são necessários para a hidratação do Next sem nonce
// (melhoria futura: CSP com nonce via middleware). connect-src inclui o
// realtime e o OBS WebSocket local (ws://localhost:4455) usado pelo painel.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV !== 'production' ? " 'unsafe-eval'" : ''),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${REALTIME_PUBLIC} ${realtimeWs} ws://localhost:4455 ws://127.0.0.1:4455`,
  "media-src 'self' blob:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const nextConfig = {
  output: 'standalone',
  // Raiz do monorepo: o build standalone inclui os pacotes internos.
  outputFileTracingRoot: path.join(path.dirname(fileURLToPath(import.meta.url)), '../../'),
  reactStrictMode: true,
  // Sem otimização de imagens no servidor (não usamos next/image; evita depender do sharp/libvips).
  images: { unoptimized: true },
  poweredByHeader: false,
  transpilePackages: ['@live-arena/shared', '@live-arena/game-engine', '@live-arena/games', '@live-arena/automation'],
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_INTERNAL_URL}/api/:path*` }];
  },
  async headers() {
    const base = [
      { key: 'Content-Security-Policy', value: csp },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ];
    return [
      // O painel não pode ser embutido em iframes (clickjacking).
      { source: '/((?!overlay).*)', headers: [...base, { key: 'X-Frame-Options', value: 'DENY' }] },
      // Overlays podem ser usados como Browser Source.
      { source: '/overlay/:path*', headers: base },
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }, { key: 'Service-Worker-Allowed', value: '/' }] },
    ];
  },
};

export default nextConfig;
