'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { Plus, Trash2, ShieldCheck } from 'lucide-react';
import { Badge, Button, Card, CopyField, EmptyState, Field, Input, Modal, PageHeader, Select, Tabs, confirmAction, toast } from '@/components/ui';
import { api, errorMessage, hasPerm, useAuth, type Me } from '@/lib/api';
import type { Connection, Provider, StreamConfig } from '@/lib/types';

function AccountTab() {
  const user = useAuth((s) => s.user);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [mfa, setMfa] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState('');
  const refresh = async () => {
    const me = await api<Me>('/auth/me');
    useAuth.getState().setSession(useAuth.getState().token, me);
  };
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Seus dados">
        <dl className="space-y-2 text-sm">
          <div><dt className="text-slate-400">Nome</dt><dd className="text-slate-100">{user?.name}</dd></div>
          <div><dt className="text-slate-400">E-mail</dt><dd className="text-slate-100">{user?.email}</dd></div>
        </dl>
      </Card>
      <Card title="Alterar senha">
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api('/auth/change-password', { method: 'POST', body: pw });
              toast('Senha alterada.');
              setPw({ currentPassword: '', newPassword: '' });
            } catch (err) {
              toast(errorMessage(err), 'bad');
            }
          }}
        >
          <Field label="Senha atual" htmlFor="pw-cur"><Input id="pw-cur" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
          <Field label="Nova senha" htmlFor="pw-new" hint="Mínimo de 10 caracteres com letras e números."><Input id="pw-new" type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
          <Button type="submit">Salvar senha</Button>
        </form>
      </Card>
      <Card title="Verificação em duas etapas (MFA)" subtitle="Protege sua conta com um código do aplicativo autenticador. Obrigatória para administradores quando configurado.">
        {user?.mfaEnabled ? (
          <div className="flex flex-col gap-3">
            <Badge tone="ok"><ShieldCheck className="mr-1 inline size-3" />Ativa</Badge>
            <Field label="Código atual para desativar" htmlFor="mfa-off"><Input id="mfa-off" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></Field>
            <Button variant="secondary" onClick={async () => { try { await api('/auth/mfa/disable', { method: 'POST', body: { code } }); toast('MFA desativada.'); setCode(''); await refresh(); } catch (e) { toast(errorMessage(e), 'bad'); } }}>Desativar</Button>
          </div>
        ) : mfa ? (
          <div className="flex flex-col gap-3">
            <img src={mfa.qr} alt="QR code para o aplicativo autenticador" className="size-44 rounded-lg bg-white p-2" />
            <CopyField label="Ou digite a chave manualmente" value={mfa.secret} />
            <Field label="Código de 6 dígitos" htmlFor="mfa-on"><Input id="mfa-on" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></Field>
            <Button onClick={async () => { try { await api('/auth/mfa/enable', { method: 'POST', body: { code } }); toast('MFA ativada!'); setMfa(null); setCode(''); await refresh(); } catch (e) { toast(errorMessage(e), 'bad'); } }}>Confirmar</Button>
          </div>
        ) : (
          <Button onClick={async () => { try { const r = await api<{ secret: string; otpauthUrl: string }>('/auth/mfa/setup', { method: 'POST' }); setMfa({ secret: r.secret, qr: await QRCode.toDataURL(r.otpauthUrl, { margin: 1, width: 220 }) }); } catch (e) { toast(errorMessage(e), 'bad'); } }}>Ativar MFA</Button>
        )}
      </Card>
    </div>
  );
}

function WorkspaceTab() {
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const tenant = useQuery({ queryKey: ['tenant'], queryFn: () => api<{ id: string; name: string; eventRetentionDays: number; plan: { name: string; limits: Record<string, unknown> } }>('/tenant') });
  const [name, setName] = useState<string | null>(null);
  const [retention, setRetention] = useState<number | null>(null);
  const t = tenant.data;
  if (!t) return null;
  const limits = t.plan.limits as Record<string, number | boolean | string[]>;
  const canManage = hasPerm(user, 'tenant:manage');
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Espaço de trabalho">
        <div className="flex flex-col gap-3">
          <Field label="Nome" htmlFor="ws-name"><Input id="ws-name" value={name ?? t.name} onChange={(e) => setName(e.target.value)} disabled={!canManage} /></Field>
          <Field label="Guardar histórico de eventos por (dias)" htmlFor="ws-ret" hint={`Seu plano permite até ${String(limits.statsRetentionDays)} dias.`}>
            <Input id="ws-ret" type="number" min={1} max={Number(limits.statsRetentionDays)} value={retention ?? t.eventRetentionDays} onChange={(e) => setRetention(Number(e.target.value))} disabled={!canManage} />
          </Field>
          {canManage && (
            <Button onClick={async () => { try { await api('/tenant', { method: 'PUT', body: { name: name ?? undefined, eventRetentionDays: retention ? Math.min(retention, Number(limits.statsRetentionDays)) : undefined } }); toast('Salvo.'); void qc.invalidateQueries({ queryKey: ['tenant'] }); } catch (e) { toast(errorMessage(e), 'bad'); } }}>Salvar</Button>
          )}
        </div>
      </Card>
      <Card title={`Plano ${t.plan.name}`} subtitle="Os limites são aplicados pelo servidor. Cobrança ainda não está ativa nesta versão.">
        <ul className="grid grid-cols-2 gap-2 text-sm">
          <li className="rounded-lg bg-white/[0.03] p-2"><span className="block text-xs text-slate-400">LIVES simultâneas</span>{String(limits.maxConcurrentSessions)}</li>
          <li className="rounded-lg bg-white/[0.03] p-2"><span className="block text-xs text-slate-400">Configurações de jogo</span>{String(limits.maxGameConfigs)}</li>
          <li className="rounded-lg bg-white/[0.03] p-2"><span className="block text-xs text-slate-400">Automações</span>{String(limits.maxAutomations)}</li>
          <li className="rounded-lg bg-white/[0.03] p-2"><span className="block text-xs text-slate-400">Duração máx. da sessão</span>{String(limits.maxSessionMinutes)} min</li>
          <li className="rounded-lg bg-white/[0.03] p-2"><span className="block text-xs text-slate-400">Jogos</span>{(limits.allowedGames as string[]).includes('*') ? 'Todos' : (limits.allowedGames as string[]).join(', ')}</li>
          <li className="rounded-lg bg-white/[0.03] p-2"><span className="block text-xs text-slate-400">Vídeo pelo servidor</span>{limits.streamOutput ? 'Sim' : 'Não'}</li>
        </ul>
      </Card>
    </div>
  );
}

function ConnectionsTab() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['connections'], queryFn: () => api<Connection[]>('/connections') });
  const providers = useQuery({ queryKey: ['providers'], queryFn: () => api<Provider[]>('/connections/providers') });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ label: '', provider: 'SIMULATOR' as Connection['provider'], tiktokUsername: '', apiKey: '', demoLoad: 'light' });
  return (
    <div className="flex flex-col gap-5">
      <Card title="Fontes de eventos do TikTok LIVE" subtitle="Como os eventos (presentes, curtidas, comentários) chegam à plataforma." action={<Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>Nova conexão</Button>}>
        <ul className="mb-4 space-y-2 text-sm">
          {(providers.data ?? []).map((p) => (
            <li key={p.id} className="flex items-start gap-2">
              <Badge tone={p.enabled ? 'ok' : 'neutral'}>{p.enabled ? 'disponível' : 'indisponível'}</Badge>
              <span className="text-slate-300"><strong>{p.id === 'SIMULATOR' ? 'Simulador' : p.id === 'EULER_STREAM' ? 'Serviço gerenciado' : 'Biblioteca open source'}</strong> — {p.note}</span>
            </li>
          ))}
        </ul>
        {(list.data ?? []).length === 0 ? (
          <EmptyState title="Nenhuma conexão" description="Crie uma conexão de Simulador para testar com eventos automáticos." />
        ) : (
          <ul className="divide-y divide-white/5">
            {list.data!.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0 text-sm">
                  <p className="truncate font-medium text-slate-100">{c.label}</p>
                  <p className="text-xs text-slate-400">{c.provider === 'SIMULATOR' ? `Simulador · carga ${c.config.demoLoad ?? 'off'}` : `@${c.tiktokUsername} · ${c.provider}`}{c.hasCredentials ? ' · credencial salva (cifrada)' : ''}</p>
                </div>
                <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} aria-label={`Excluir ${c.label}`} onClick={async () => { if (!(await confirmAction({ title: 'Excluir conexão', message: `“${c.label}” será removida das LIVES que a usam.`, confirmLabel: 'Excluir' }))) return; await api(`/connections/${c.id}`, { method: 'DELETE' }).catch((e: unknown) => toast(errorMessage(e), 'bad')); void qc.invalidateQueries({ queryKey: ['connections'] }); }} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title="Nova conexão" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={async () => { try { await api('/connections', { method: 'POST', body: { label: form.label || 'Minha conexão', provider: form.provider, tiktokUsername: form.provider === 'SIMULATOR' ? undefined : form.tiktokUsername, apiKey: form.apiKey || undefined, demoLoad: form.provider === 'SIMULATOR' ? form.demoLoad : undefined } }); toast('Conexão criada.'); setOpen(false); void qc.invalidateQueries({ queryKey: ['connections'] }); } catch (e) { toast(errorMessage(e), 'bad'); } }}>Salvar</Button></>}>
        <div className="flex flex-col gap-4">
          <Field label="Nome" htmlFor="c-label"><Input id="c-label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} maxLength={60} /></Field>
          <Field label="Tipo" htmlFor="c-prov">
            <Select id="c-prov" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value as Connection['provider'] })}>
              <option value="SIMULATOR">Simulador (eventos fictícios automáticos)</option>
              <option value="EULER_STREAM" disabled={!providers.data?.find((p) => p.id === 'EULER_STREAM')?.enabled}>Serviço gerenciado (requer API key)</option>
              <option value="TIKTOK_TTLC" disabled={!providers.data?.find((p) => p.id === 'TIKTOK_TTLC')?.enabled}>Biblioteca open source (desabilitada por licença)</option>
            </Select>
          </Field>
          {form.provider === 'SIMULATOR' ? (
            <Field label="Intensidade dos eventos automáticos" htmlFor="c-load">
              <Select id="c-load" value={form.demoLoad} onChange={(e) => setForm({ ...form, demoLoad: e.target.value })}>
                <option value="off">Desligado (somente botões do simulador)</option>
                <option value="light">Leve</option>
                <option value="busy">Movimentado</option>
              </Select>
            </Field>
          ) : (
            <>
              <Field label="@usuário do TikTok" htmlFor="c-user" hint="O criador precisa estar ao vivo para receber eventos."><Input id="c-user" value={form.tiktokUsername} onChange={(e) => setForm({ ...form, tiktokUsername: e.target.value })} placeholder="@seucanal" /></Field>
              <Field label="API key do provedor (opcional)" htmlFor="c-key" hint="Guardada cifrada. Nunca pedimos sua senha do TikTok."><Input id="c-key" type="password" autoComplete="off" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} /></Field>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}

function StreamsTab() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['streams'], queryFn: () => api<StreamConfig[]>('/streams') });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', mode: 'RECORD' as StreamConfig['mode'], rtmpUrl: '', streamKey: '', profile: 'v720p30' });
  const profiles: Record<string, { width: number; height: number; fps: number; videoBitrateKbps: number }> = {
    v720p30: { width: 720, height: 1280, fps: 30, videoBitrateKbps: 2500 },
    v1080p30: { width: 1080, height: 1920, fps: 30, videoBitrateKbps: 4500 },
    h720p30: { width: 1280, height: 720, fps: 30, videoBitrateKbps: 2500 },
    h1080p30: { width: 1920, height: 1080, fps: 30, videoBitrateKbps: 4500 },
  };
  return (
    <Card title="Saída de vídeo pelo servidor (opcional)" subtitle="O jeito recomendado é o OBS com o link de overlay. Aqui você configura o envio direto do servidor via RTMP — somente com URL e chave fornecidas legitimamente pela plataforma — ou a gravação para testes." action={<Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>Nova saída</Button>}>
      {(list.data ?? []).length === 0 ? (
        <EmptyState title="Nenhuma saída configurada" />
      ) : (
        <ul className="divide-y divide-white/5">
          {list.data!.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-100">{s.name} <Badge>{s.mode === 'RTMP' ? 'RTMP' : s.mode === 'RECORD' ? 'Gravação' : 'OBS'}</Badge></p>
                <p className="text-xs text-slate-400">{s.width}×{s.height} · {s.fps}fps · {s.videoBitrateKbps} kbps{s.streamKeyMasked ? ` · chave ${s.streamKeyMasked}` : ''}</p>
              </div>
              <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} aria-label={`Excluir ${s.name}`} onClick={async () => { if (!(await confirmAction({ title: 'Excluir saída', message: 'A configuração e a chave cifrada serão apagadas.', confirmLabel: 'Excluir' }))) return; await api(`/streams/${s.id}`, { method: 'DELETE' }).catch((e: unknown) => toast(errorMessage(e), 'bad')); void qc.invalidateQueries({ queryKey: ['streams'] }); }} />
            </li>
          ))}
        </ul>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Nova saída de vídeo" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={async () => { try { await api('/streams', { method: 'POST', body: { name: form.name || 'Saída', mode: form.mode, rtmpUrl: form.mode === 'RTMP' ? form.rtmpUrl : undefined, streamKey: form.mode === 'RTMP' ? form.streamKey : undefined, ...profiles[form.profile], audioBitrateKbps: 128 } }); toast('Saída criada. Vincule-a a uma LIVE.'); setOpen(false); void qc.invalidateQueries({ queryKey: ['streams'] }); } catch (e) { toast(errorMessage(e), 'bad'); } }}>Salvar</Button></>}>
        <div className="flex flex-col gap-4">
          <Field label="Nome" htmlFor="s-name"><Input id="s-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Modo" htmlFor="s-mode">
            <Select id="s-mode" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as StreamConfig['mode'] })}>
              <option value="RECORD">Gravação em arquivo (teste)</option>
              <option value="RTMP">RTMP (chave fornecida pela plataforma)</option>
            </Select>
          </Field>
          <Field label="Qualidade" htmlFor="s-prof" hint="Bitrates mais altos exigem mais CPU no servidor e mais upload.">
            <Select id="s-prof" value={form.profile} onChange={(e) => setForm({ ...form, profile: e.target.value })}>
              <option value="v720p30">Vertical 720×1280 · 30fps · 2,5 Mbps</option>
              <option value="v1080p30">Vertical 1080×1920 · 30fps · 4,5 Mbps</option>
              <option value="h720p30">Horizontal 1280×720 · 30fps · 2,5 Mbps</option>
              <option value="h1080p30">Horizontal 1920×1080 · 30fps · 4,5 Mbps</option>
            </Select>
          </Field>
          {form.mode === 'RTMP' && (
            <>
              <Field label="URL do servidor RTMP" htmlFor="s-url"><Input id="s-url" value={form.rtmpUrl} onChange={(e) => setForm({ ...form, rtmpUrl: e.target.value })} placeholder="rtmps://…/app" /></Field>
              <Field label="Chave de transmissão" htmlFor="s-key" hint="Guardada cifrada (AES-256-GCM) e nunca exibida novamente."><Input id="s-key" type="password" autoComplete="off" value={form.streamKey} onChange={(e) => setForm({ ...form, streamKey: e.target.value })} /></Field>
            </>
          )}
        </div>
      </Modal>
    </Card>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState<'account' | 'workspace' | 'connections' | 'streams'>('account');
  return (
    <>
      <PageHeader title="Configurações" />
      <Tabs value={tab} onChange={setTab} items={[{ value: 'account', label: 'Conta e segurança' }, { value: 'workspace', label: 'Espaço e plano' }, { value: 'connections', label: 'Conexões TikTok' }, { value: 'streams', label: 'Saída de vídeo' }]} />
      {tab === 'account' && <AccountTab />}
      {tab === 'workspace' && <WorkspaceTab />}
      {tab === 'connections' && <ConnectionsTab />}
      {tab === 'streams' && <StreamsTab />}
    </>
  );
}
