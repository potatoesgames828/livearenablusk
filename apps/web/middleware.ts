import { NextResponse, type NextRequest } from 'next/server';

/**
 * Proteção contra falsificação de IP (rate limit / força bruta).
 *
 * A API identifica o cliente pelo X-Forwarded-For vindo de proxies confiáveis.
 * Se o web estiver exposto diretamente (sem proxy de borda), um cliente poderia
 * enviar um X-Forwarded-For falso e o Next o repassaria para a API. Por isso,
 * a menos que EDGE_PROXY=true (nginx/Caddy/balanceador que SOBRESCREVE o
 * cabeçalho — ver infrastructure/reverse-proxy), removemos os cabeçalhos de IP
 * enviados pelo cliente antes de encaminhar /api.
 */
export function middleware(req: NextRequest) {
  if (process.env.EDGE_PROXY === 'true') return NextResponse.next();
  const headers = new Headers(req.headers);
  headers.delete('x-forwarded-for');
  headers.delete('x-real-ip');
  headers.delete('forwarded');
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: '/api/:path*' };
