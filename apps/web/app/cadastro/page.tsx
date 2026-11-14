'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AuthShell } from '@/components/brand';
import { Button, Field, Input } from '@/components/ui';
import { api, ApiError, errorMessage, useAuth, type Me } from '@/lib/api';

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', password: '', workspaceName: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const errs: Record<string, string> = {};
    if (form.name.trim().length < 2) errs.name = 'Informe seu nome.';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) errs.email = 'E-mail inválido.';
    if (form.password.length < 10 || !/[a-z]/i.test(form.password) || !/\d/.test(form.password)) errs.password = 'Use pelo menos 10 caracteres com letras e números.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    try {
      const r = await api<{ accessToken: string; user: Me }>('/auth/register', {
        method: 'POST',
        body: { ...form, workspaceName: form.workspaceName.trim() || undefined },
        retry: false,
      });
      useAuth.getState().setSession(r.accessToken, r.user);
      router.replace('/painel?boas-vindas=1');
    } catch (err) {
      if (err instanceof ApiError && Array.isArray(err.details)) {
        const map: Record<string, string> = {};
        for (const d of err.details as Array<{ path: string; message: string }>) map[d.path] = d.message;
        setErrors(map);
      }
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Criar conta"
      subtitle="Leva menos de um minuto. Sem cartão de crédito."
      footer={
        <>
          Já tem conta?{' '}
          <Link href="/entrar" className="font-semibold text-blue-300 hover:underline">
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label="Seu nome" htmlFor="name" error={errors.name}>
          <Input id="name" autoComplete="name" value={form.name} onChange={set('name')} aria-invalid={!!errors.name} />
        </Field>
        <Field label="E-mail" htmlFor="email" error={errors.email}>
          <Input id="email" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={set('email')} aria-invalid={!!errors.email} />
        </Field>
        <Field label="Senha" htmlFor="password" error={errors.password} hint="Mínimo de 10 caracteres, com letras e números.">
          <Input id="password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} aria-invalid={!!errors.password} />
        </Field>
        <Field label="Nome do seu canal ou espaço (opcional)" htmlFor="ws">
          <Input id="ws" value={form.workspaceName} onChange={set('workspaceName')} placeholder="Ex.: Canal da Ana" />
        </Field>
        {error && (
          <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}
        <Button type="submit" loading={loading} size="lg">
          Criar conta
        </Button>
        <p className="text-center text-xs text-slate-500">Ao criar a conta você concorda em usar a plataforma conforme as regras do TikTok.</p>
      </form>
    </AuthShell>
  );
}
