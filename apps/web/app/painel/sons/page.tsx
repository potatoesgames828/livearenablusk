'use client';
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Music, Play, Square, Trash2, Upload } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Field, PageHeader, Select, Skeleton, confirmAction, toast } from '@/components/ui';
import { api, apiBinary, errorMessage, hasPerm, useAuth } from '@/lib/api';
import { timeAgo } from '@/lib/format';

interface Sound { id: string; name: string; mime: string; size: number; createdAt: string }
interface Binding { slot: string; soundId: string; volume: number }
interface SoundsResponse { items: Sound[]; bindings: Binding[]; slots: string[]; limit: number; maxBytes: number }

const SLOT_LABELS: Record<string, { label: string; help: string }> = {
  'game.join': { label: 'Entrada de participante', help: 'Toca quando alguém entra no jogo (no máximo a cada 1,5 s).' },
  'game.roundStart': { label: 'Início de partida/rodada', help: 'Toca quando uma nova partida ou rodada começa.' },
  'game.victory': { label: 'Vitória / fim de partida', help: 'Toca quando a partida termina com um vencedor.' },
};

function useAudioPreview() {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const urls = useRef(new Map<string, string>());
  async function toggle(id: string, volume = 80) {
    if (playing === id) {
      ref.current?.pause();
      setPlaying(null);
      return;
    }
    ref.current?.pause();
    try {
      let url = urls.current.get(id);
      if (!url) {
        const res = await apiBinary(`/sounds/${id}/file`);
        url = URL.createObjectURL(await res.blob());
        urls.current.set(id, url);
      }
      const a = new Audio(url);
      a.volume = volume / 100;
      a.onended = () => setPlaying(null);
      ref.current = a;
      setPlaying(id);
      await a.play();
    } catch (err) {
      setPlaying(null);
      toast(errorMessage(err), 'bad');
    }
  }
  return { playing, toggle };
}

export default function SoundboardPage() {
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const canEdit = hasPerm(user, 'game:configure');
  const q = useQuery({ queryKey: ['sounds'], queryFn: () => api<SoundsResponse>('/sounds') });
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const preview = useAudioPreview();

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const f = files[0]!;
    if (f.size > (q.data?.maxBytes ?? 1048576)) return toast('Arquivo maior que 1 MB.', 'bad');
    setUploading(true);
    try {
      const name = f.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 60);
      await apiBinary(`/sounds?name=${encodeURIComponent(name)}`, { method: 'POST', body: f, contentType: 'application/octet-stream' });
      toast('Som enviado.');
      void qc.invalidateQueries({ queryKey: ['sounds'] });
    } catch (err) {
      toast(errorMessage(err), 'bad');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }
  async function remove(s: Sound) {
    if (!(await confirmAction({ title: 'Excluir som', message: `"${s.name}" será removido dos alertas e momentos de jogo que o usam.`, confirmLabel: 'Excluir', danger: true }))) return;
    try {
      await api(`/sounds/${s.id}`, { method: 'DELETE' });
      void qc.invalidateQueries({ queryKey: ['sounds'] });
    } catch (err) {
      toast(errorMessage(err), 'bad');
    }
  }
  async function bind(slot: string, soundId: string | null, volume: number) {
    try {
      await api('/sound-bindings', { method: 'PUT', body: { slot, soundId, volume } });
      void qc.invalidateQueries({ queryKey: ['sounds'] });
      toast('Associação salva.');
    } catch (err) {
      toast(errorMessage(err), 'bad');
    }
  }

  const d = q.data;
  return (
    <>
      <PageHeader
        title="Soundboard"
        description="Envie seus sons e associe aos momentos dos jogos e aos alertas. Os sons tocam no overlay do OBS."
        actions={canEdit && (
          <>
            <input ref={fileRef} type="file" accept="audio/mpeg,audio/ogg,audio/wav,.mp3,.ogg,.wav" className="hidden" onChange={(e) => void upload(e.target.files)} />
            <Button icon={<Upload className="size-4" />} loading={uploading} onClick={() => fileRef.current?.click()} disabled={!!d && d.items.length >= d.limit}>Enviar som</Button>
          </>
        )}
      />
      {q.isLoading ? <Skeleton className="h-64" /> : q.isError ? (
        <EmptyState title="Não foi possível carregar os sons" description={errorMessage(q.error)} action={<Button onClick={() => void q.refetch()}>Tentar de novo</Button>} />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1fr]">
          <Card title="Biblioteca de sons" subtitle={`${d!.items.length} de ${d!.limit} no seu plano · MP3, OGG ou WAV até 1 MB`}>
            {d!.items.length === 0 ? (
              <EmptyState icon={<Music className="size-6" />} title="Nenhum som ainda" description="Envie um arquivo curto (ex.: aplausos, buzina, fanfarra). O formato é conferido pelo conteúdo do arquivo." />
            ) : (
              <ul className="divide-y divide-white/5">
                {d!.items.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 py-2">
                    <Button size="sm" variant="ghost" aria-label={preview.playing === s.id ? `Parar ${s.name}` : `Ouvir ${s.name}`} icon={preview.playing === s.id ? <Square className="size-4" /> : <Play className="size-4" />} onClick={() => void preview.toggle(s.id)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-100">{s.name}</p>
                      <p className="text-xs text-slate-400">{s.mime.replace('audio/', '').toUpperCase()} · {(s.size / 1024).toFixed(0)} KB · {timeAgo(s.createdAt)}</p>
                    </div>
                    {d!.bindings.some((b) => b.soundId === s.id) && <Badge tone="info">em uso</Badge>}
                    {canEdit && <Button size="sm" variant="ghost" aria-label={`Excluir ${s.name}`} icon={<Trash2 className="size-4" />} onClick={() => void remove(s)} />}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Sons dos jogos" subtitle="Valem para todos os jogos, no overlay do criador.">
            <div className="space-y-4">
              {d!.slots.map((slot) => {
                const b = d!.bindings.find((x) => x.slot === slot);
                const meta = SLOT_LABELS[slot] ?? { label: slot, help: '' };
                return (
                  <div key={slot} className="rounded-xl border border-line p-3">
                    <Field label={meta.label} htmlFor={`slot-${slot}`} hint={meta.help}>
                      <Select id={`slot-${slot}`} value={b?.soundId ?? ''} disabled={!canEdit} onChange={(e) => void bind(slot, e.target.value || null, b?.volume ?? 80)}>
                        <option value="">Nenhum (silêncio)</option>
                        {d!.items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </Select>
                    </Field>
                    {b && (
                      <label className="mt-2 flex items-center gap-3 text-sm text-slate-300">
                        Volume
                        <input type="range" min={0} max={100} defaultValue={b.volume} disabled={!canEdit} className="flex-1 accent-violet-500"
                          onMouseUp={(e) => void bind(slot, b.soundId, Number((e.target as HTMLInputElement).value))}
                          onTouchEnd={(e) => void bind(slot, b.soundId, Number((e.target as HTMLInputElement).value))}
                          onKeyUp={(e) => void bind(slot, b.soundId, Number((e.target as HTMLInputElement).value))} aria-label={`Volume de ${meta.label}`} />
                        <Button size="sm" variant="ghost" aria-label="Ouvir" icon={<Play className="size-4" />} onClick={() => void preview.toggle(b.soundId, b.volume)} />
                      </label>
                    )}
                  </div>
                );
              })}
              <p className="text-xs text-slate-500">Para tocar um som quando chegar um presente, comentário ou meta, crie um alerta em <a className="underline" href="/painel/alertas">Alertas</a>.</p>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
