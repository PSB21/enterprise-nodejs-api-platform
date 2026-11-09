'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { AuthCard } from '@/components/auth-card';
import { LoginForm, type LoginValues } from '@/components/login-form';
import { errorMessage } from '@/lib/errors';
import { login } from '@/lib/session';
import { useAppSelector } from '@/store';

export default function LoginPage() {
  const router = useRouter();
  const status = useAppSelector((s) => s.auth.status);
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  // Already logged in (for example after a refresh): go straight to the dashboard.
  useEffect(() => {
    if (status === 'authenticated') router.replace('/apis');
  }, [status, router]);

  async function handleSubmit({ email, password }: LoginValues) {
    setSubmitting(true);
    setError(undefined);
    try {
      await login(email, password);
      router.replace('/apis');
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <AuthCard title="Log in">
      <LoginForm onSubmit={handleSubmit} error={error} submitting={submitting} />
      <p className="mt-5 text-center text-sm text-slate-600">
        No account?{' '}
        <Link href="/register" className="font-medium text-indigo-600 hover:underline">
          Create one
        </Link>
      </p>
    </AuthCard>
  );
}
