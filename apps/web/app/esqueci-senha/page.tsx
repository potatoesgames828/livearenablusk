'use client';
import Link from 'next/link';
import { useState } from 'react';
import { AuthShell } from '@/components/brand';
import { Button, Field, Input } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

export default function ForgotPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  return (
    <AuthShell title="Recuperar senha" subtitle="Enviaremos um link para criar uma nova senha." footer={<Link href="/entrar" className="text-blue-300 hover:underline">Voltar para o login</Link>}>
      {sent ? (
        <p className="rounded-lg border border-ok/30 bg-ok/10 px-3 py-3 text-sm text-green-200">
          Se o e-mail estiver cadastrado, você receberá as instruções em instantes. Confira também a caixa de spam.
        </p>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            setError(null);
            try {
              await api('/auth/forgot-password', { method: 'POST', body: { email }, retry: false });
              setSent(true);
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setLoading(false);
            }
          }}
        >
          <Field label="E-mail" htmlFor="email">
            <Input id="email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          <Button type="submit" loading={loading} size="lg">
            Enviar link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
