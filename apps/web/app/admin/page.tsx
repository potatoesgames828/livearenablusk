'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { useRequireAuth } from '@/components/app-shell';
import { Badge, Button, Card, Input, PageHeader, Select, Spinner, Stat, StatusPill, Tabs, Textarea, confirmAction, toast } from '@/components/ui';
import { api, errorMessage, useAuth } from '@/lib/api';
import { labelSession, sessionTone, timeAgo } from '@/lib/format';

type Tab = 'overview' | 'users' | 'tenants' | 'sessions' | 'alerts' | 'audit' | 'plans';

function Overview() {
  const q = useQuery({ queryKey: ['admin-overview'], queryFn: () => api<{ users: number; tenants: number; activeSessions: number; openAlerts: number; services: Array<{ id: string; kind: string; hostname: string; at: number; meta: Record<string, unknown> }>; queues: Array<{ name: string; counts: Record<string, number> }> }>('/admin/overview'), refetchInterval: 5000 });
  if (!q.data) return <Spinner />;
  const d = q.data;
  const kinds = ['api', 'realtime', 'worker', 'game-runner', 'connector', 'stream-manager'];
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Usuários" value={d.users} />
        <Stat label="Tenants" value={d.tenants} />
        <Stat label="Sessões ativas" value={d.activeSessions} />
        <Stat label="Alertas abertos" value={d.openAlerts} tone={d.openAlerts ? 'warn' : 'ok'} />
      </div>
      <Card title="Serviços (heartbeat)" subtitle="Cada componente roda em processo separado. Sem heartbeat por 15s = fora do ar.">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {kinds.map((k) => {
            const inst = d.services.filter((s) => s.kind === k);
            return (
              <div key={k} className="rounded-xl border border-line p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-100">{k}</span>
                  <StatusPill tone={inst.length ? 'ok' : 'bad'}>{inst.length ? `${inst.length} ativo(s)` : 'fora do ar'}</StatusPill>
                </div>
                {inst.map((s) => <p key={s.id} className="mt-1 truncate font-mono text-[11px] text-slate-500">{s.id} · {timeAgo(new Date(s.at))}</p>)}
              </div>
            );
          })}
        </div>
      </Card>
      <Card title="Filas">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead><tr className="text-left text-xs uppercase text-slate-400"><th className="py-2">Fila</th><th className="text-right">Aguardando</th><th className="text-right">Ativos</th><th className="text-right">Agendados</th><th className="text-right">Falhas</th></tr></thead>
            <tbody className="divide-y divide-white/5">
              {d.queues.map((q2) => (
                <tr key={q2.name}><td className="py-2 font-mono text-slate-200">{q2.name}</td><td className="text-right tabular-nums">{(q2.counts.waiting ?? 0) + (q2.counts.prioritized ?? 0)}</td><td className="text-right tabular-nums">{q2.counts.active ?? 0}</td><td className="text-right tabular-nums">{q2.counts.delayed ?? 0}</td><td className="text-right tabular-nums">{q2.counts.failed ?? 0}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Users() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const list = useQuery({ queryKey: ['admin-users', q], queryFn: () => api<Array<{ id: string; email: string; name: string; platformRole: string; status: string; mfaEnabled: boolean; lastLoginAt: string | null }>>(`/admin/users?q=${encodeURIComponent(q)}`) });
  return (
    <Card title="Usuários" action={<Input placeholder="Buscar e-mail ou nome" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar usuários" />}>
      <ul className="divide-y divide-white/5">
        {(list.data ?? []).map((u) => (
          <li key={u.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-sm">
              <p className="truncate text-slate-100">{u.name} · {u.email}</p>
              <p className="text-xs text-slate-500">{u.platformRole} · MFA {u.mfaEnabled ? 'sim' : 'não'} · último login {timeAgo(u.lastLoginAt)}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={u.status === 'ACTIVE' ? 'ok' : 'bad'}>{u.status === 'ACTIVE' ? 'ativo' : 'suspenso'}</Badge>
              <Button size="sm" variant={u.status === 'ACTIVE' ? 'danger' : 'secondary'} onClick={async () => {
                const next = u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
                if (!(await confirmAction({ title: next === 'SUSPENDED' ? 'Suspender conta' : 'Reativar conta', message: `${u.email}: ${next === 'SUSPENDED' ? 'o acesso será bloqueado e as sessões encerradas.' : 'o acesso será liberado.'}`, confirmLabel: next === 'SUSPENDED' ? 'Suspender' : 'Reativar', danger: next === 'SUSPENDED' }))) return;
                await api(`/admin/users/${u.id}/status`, { method: 'PUT', body: { status: next } }).then(() => toast('Atualizado.')).catch((e: unknown) => toast(errorMessage(e), 'bad'));
                void qc.invalidateQueries({ queryKey: ['admin-users'] });
              }}>{u.status === 'ACTIVE' ? 'Suspender' : 'Reativar'}</Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Tenants() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['admin-tenants'], queryFn: () => api<Array<{ id: string; name: string; planCode: string; status: string; _count: { sessions: number; memberships: number } }>>('/admin/tenants') });
  const plans = useQuery({ queryKey: ['admin-plans'], queryFn: () => api<Array<{ code: string; name: string }>>('/admin/plans') });
  return (
    <Card title="Tenants">
      <ul className="divide-y divide-white/5">
        {(list.data ?? []).map((t) => (
          <li key={t.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-sm">
              <p className="truncate text-slate-100">{t.name}</p>
              <p className="text-xs text-slate-500">{t._count.memberships} membro(s) · {t._count.sessions} LIVE(s) · {t.status}</p>
            </div>
            <Select className="sm:w-48" value={t.planCode} aria-label={`Plano de ${t.name}`} onChange={async (e) => { await api(`/admin/tenants/${t.id}/plan`, { method: 'PUT', body: { planCode: e.target.value } }).then(() => toast('Plano alterado.')).catch((err: unknown) => toast(errorMessage(err), 'bad')); void qc.invalidateQueries({ queryKey: ['admin-tenants'] }); }}>
              {(plans.data ?? []).map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
            </Select>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Sessions() {
  const list = useQuery({ queryKey: ['admin-sessions'], queryFn: () => api<Array<{ id: string; tenantId: string; name: string; state: string; connectorState: string; runnerState: string; streamState: string; demo: boolean; lastError: string | null; lastHeartbeatAt: string | null }>>('/admin/sessions'), refetchInterval: 5000 });
  return (
    <Card title="Sessões ativas ou com erro">
      <ul className="divide-y divide-white/5">
        {(list.data ?? []).map((s) => (
          <li key={s.id} className="py-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-slate-100">{s.name}</span>
              <StatusPill tone={sessionTone(s.state)}>{labelSession(s.state)}</StatusPill>
              {s.demo && <Badge tone="warn">demo</Badge>}
            </div>
            <p className="mt-1 font-mono text-[11px] text-slate-500">tenant {s.tenantId} · fonte {s.connectorState} · jogo {s.runnerState} · vídeo {s.streamState} · heartbeat {timeAgo(s.lastHeartbeatAt)}</p>
            {s.lastError && <p className="text-xs text-red-300">{s.lastError}</p>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Alerts() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['admin-alerts'], queryFn: () => api<Array<{ id: string; severity: string; component: string; code: string; message: string; count: number; lastSeenAt: string; resolvedAt: string | null }>>('/admin/alerts?open=true'), refetchInterval: 5000 });
  return (
    <Card title="Alertas abertos">
      {(list.data ?? []).length === 0 && <p className="text-sm text-slate-400">Nenhum alerta aberto. 🎉</p>}
      <ul className="divide-y divide-white/5">
        {(list.data ?? []).map((a) => (
          <li key={a.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-sm">
              <p className="text-slate-100"><Badge tone={a.severity === 'CRITICAL' ? 'bad' : a.severity === 'WARNING' ? 'warn' : 'info'}>{a.severity}</Badge> <span className="font-mono text-xs">{a.component}/{a.code}</span> ×{a.count}</p>
              <p className="text-xs text-slate-400">{a.message} · {timeAgo(a.lastSeenAt)}</p>
            </div>
            <Button size="sm" variant="secondary" onClick={async () => { await api(`/admin/alerts/${a.id}/resolve`, { method: 'POST' }).catch((e: unknown) => toast(errorMessage(e), 'bad')); void qc.invalidateQueries({ queryKey: ['admin-alerts'] }); }}>Resolver</Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Audit() {
  const [q, setQ] = useState('');
  const list = useQuery({ queryKey: ['admin-audit', q], queryFn: () => api<Array<{ id: string; action: string; tenantId: string | null; targetType: string | null; targetId: string | null; ip: string | null; createdAt: string; actor: { email: string } | null }>>(`/admin/audit?q=${encodeURIComponent(q)}`) });
  return (
    <Card title="Auditoria" action={<Input placeholder="Filtrar ação (ex.: admin.)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filtrar auditoria" />}>
      <ul className="divide-y divide-white/5 text-sm">
        {(list.data ?? []).map((l) => (
          <li key={l.id} className="py-2">
            <span className="font-mono text-xs text-blue-300">{l.action}</span> <span className="text-slate-300">{l.actor?.email ?? 'sistema'}</span>
            <span className="block text-xs text-slate-500">{new Date(l.createdAt).toLocaleString('pt-BR')} · {l.targetType ?? ''} {l.targetId ?? ''} · IP {l.ip ?? '—'}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Plans() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['admin-plans'], queryFn: () => api<Array<{ code: string; name: string; limits: Record<string, unknown> }>>('/admin/plans') });
  const [edit, setEdit] = useState<Record<string, string>>({});
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {(list.data ?? []).map((p) => (
        <Card key={p.code} title={`${p.name} (${p.code})`} subtitle="Limites em JSON — validados pelo servidor.">
          <Textarea className="min-h-56 font-mono text-xs" value={edit[p.code] ?? JSON.stringify(p.limits, null, 2)} onChange={(e) => setEdit({ ...edit, [p.code]: e.target.value })} aria-label={`Limites do plano ${p.name}`} />
          <Button className="mt-3" onClick={async () => {
            try {
              const limits = JSON.parse(edit[p.code] ?? JSON.stringify(p.limits)) as unknown;
              await api(`/admin/plans/${p.code}`, { method: 'PUT', body: { limits } });
              toast('Plano atualizado.');
              void qc.invalidateQueries({ queryKey: ['admin-plans'] });
            } catch (e) {
              toast(e instanceof SyntaxError ? 'JSON inválido.' : errorMessage(e), 'bad');
            }
          }}>Salvar limites</Button>
        </Card>
      ))}
    </div>
  );
}

export default function AdminPage() {
  const ok = useRequireAuth();
  const user = useAuth((s) => s.user);
  const [tab, setTab] = useState<Tab>('overview');
  if (!ok) return <div className="grid min-h-dvh place-items-center"><Spinner /></div>;
  if (user?.platformRole !== 'ADMIN' && user?.platformRole !== 'OPERATOR') {
    return (
      <main className="app-backdrop grid min-h-dvh place-items-center p-6 text-center">
        <div><ShieldAlert className="mx-auto size-10 text-amber-400" /><p className="mt-3 text-slate-200">Acesso restrito à equipe da plataforma.</p><Link href="/painel" className="text-blue-300">Voltar ao painel</Link></div>
      </main>
    );
  }
  return (
    <main className="app-backdrop min-h-dvh px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <Link href="/painel" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-slate-300"><ArrowLeft className="size-4" /> Painel</Link>
        <PageHeader title="Administração da plataforma" description={`Perfil: ${user.platformRole}${user.mfaVerified ? ' · MFA verificado' : ''}. Todas as ações são auditadas.`} />
        <Tabs value={tab} onChange={setTab} items={[{ value: 'overview', label: 'Serviços' }, { value: 'sessions', label: 'Sessões' }, { value: 'alerts', label: 'Alertas' }, { value: 'users', label: 'Usuários' }, { value: 'tenants', label: 'Tenants' }, { value: 'plans', label: 'Planos' }, { value: 'audit', label: 'Auditoria' }]} />
        {tab === 'overview' && <Overview />}
        {tab === 'users' && <Users />}
        {tab === 'tenants' && <Tenants />}
        {tab === 'sessions' && <Sessions />}
        {tab === 'alerts' && <Alerts />}
        {tab === 'audit' && <Audit />}
        {tab === 'plans' && <Plans />}
      </div>
    </main>
  );
}
