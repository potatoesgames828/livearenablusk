'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AuthShell } from '@/components/brand';
import { Button, Field, Input } from '@/components/ui';
import { api, errorMessage, useAuth, type Me } from '@/lib/api';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [needMfa, setNeedMfa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await api<{ accessToken?: string; user?: Me; mfaRequired?: boolean }>('/auth/login', {
        method: 'POST',
        body: { email, password, mfaCode: needMfa ? mfaCode : undefined },
        retry: false,
      });
      if (r.mfaRequired) {
        setNeedMfa(true);
        return;
      }
      useAuth.getState().setSession(r.accessToken!, r.user!);
      const next = params.get('next');
      router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/painel');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {!needMfa ? (
        <>
          <Field label="E-mail" htmlFor="email">
            <Input id="email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Senha" htmlFor="password">
            <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </>
      ) : (
        <Field label="Código do autenticador" hint="Abra seu aplicativo autenticador e digite o código de 6 dígitos." htmlFor="mfa">
          <Input id="mfa" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))} />
        </Field>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}
      <Button type="submit" loading={loading} size="lg">
        {needMfa ? 'Verificar' : 'Entrar'}
      </Button>
      <Link href="/esqueci-senha" className="text-center text-sm text-blue-300 hover:underline">
        Esqueci minha senha
      </Link>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthShell
      title="Entrar"
      subtitle="Acesse seu painel de LIVE."
      footer={
        <>
          Ainda não tem conta?{' '}
          <Link href="/cadastro" className="font-semibold text-blue-300 hover:underline">
            Criar conta grátis
          </Link>
        </>
      }
    >
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
