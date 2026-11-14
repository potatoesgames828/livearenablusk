'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AuthShell } from '@/components/brand';
import { Button, Field, Input } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

function ResetForm() {
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  if (done)
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-lg border border-ok/30 bg-ok/10 px-3 py-3 text-sm text-green-200">Senha alterada! Por segurança, encerramos as outras sessões.</p>
        <Link href="/entrar" className="text-center font-semibold text-blue-300">
          Entrar
        </Link>
      </div>
    );
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
          await api('/auth/reset-password', { method: 'POST', body: { token, password }, retry: false });
          setDone(true);
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setLoading(false);
        }
      }}
    >
      <Field label="Nova senha" htmlFor="pw" hint="Mínimo de 10 caracteres, com letras e números.">
        <Input id="pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <Button type="submit" loading={loading} size="lg" disabled={!token}>
        Salvar nova senha
      </Button>
    </form>
  );
}

export default function ResetPage() {
  return (
    <AuthShell title="Criar nova senha">
      <Suspense>
        <ResetForm />
      </Suspense>
    </AuthShell>
  );
}
