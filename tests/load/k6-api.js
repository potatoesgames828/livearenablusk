/**
 * k6 — carga HTTP na API (somente ambiente local/staging autorizado).
 *   k6 run -e API=http://127.0.0.1:4000/api -e TOKEN=<access token> -e SESSION=<id> tests/load/k6-api.js
 * Prepare uma sessão em execução (plano avançado) e passe o token/ID.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const API = __ENV.API || 'http://127.0.0.1:4000/api';
const TOKEN = __ENV.TOKEN;
const SESSION = __ENV.SESSION;

export const options = {
  scenarios: {
    leitura: { executor: 'ramping-vus', startVUs: 1, stages: [{ duration: '20s', target: 20 }, { duration: '30s', target: 50 }, { duration: '10s', target: 0 }], exec: 'leitura' },
    simulacao: { executor: 'constant-arrival-rate', rate: 10, timeUnit: '1s', duration: '60s', preAllocatedVUs: 10, exec: 'simulacao' },
  },
  thresholds: {
    'http_req_failed{scenario:leitura}': ['rate<0.01'],
    'http_req_duration{scenario:leitura}': ['p(95)<300'],
    'http_req_duration{scenario:simulacao}': ['p(95)<500'],
  },
};

const headers = () => ({ headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', 'x-forwarded-for': `10.1.${__VU % 250}.${__ITER % 250}` } });

export function leitura() {
  const r1 = http.get(`${API}/sessions/${SESSION}`, headers());
  check(r1, { 'sessão 200': (r) => r.status === 200 });
  const r2 = http.get(`${API}/games/configs`, headers());
  check(r2, { 'configs 200': (r) => r.status === 200 });
  sleep(0.5);
}

export function simulacao() {
  const r = http.post(`${API}/sessions/${SESSION}/simulate`, JSON.stringify({ type: 'GIFT', count: 3 }), headers());
  check(r, { 'simulação 200 ou 429 (limite por usuário)': (x) => x.status === 200 || x.status === 429 });
}
