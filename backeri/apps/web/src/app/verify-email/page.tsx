'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';

function VerifyEmailInner() {
  const searchParams = useSearchParams();
  const { refreshUser } = useAuth();
  const token = searchParams.get('token') ?? '';

  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>(
    token ? 'verifying' : 'error'
  );
  const [message, setMessage] = useState(
    token ? 'Verifying your email address...' : 'Missing verification token.'
  );

  useEffect(() => {
    if (!token) return;
    apiFetch<{ verified: boolean; email: string }>('/api/v1/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        setStatus('success');
        setMessage(`Email ${res.email} has been verified!`);
        await refreshUser();
      })
      .catch((err) => {
        setStatus('error');
        setMessage(
          err instanceof Error
            ? err.message
            : 'Verification link is invalid or expired.'
        );
      });
  }, [token, refreshUser]);

  return (
    <div className="rounded-3xl border border-wheat bg-white p-8 text-center shadow-sm">
      {status === 'verifying' && (
        <Loader2 className="mx-auto h-10 w-10 animate-spin text-terracotta" />
      )}
      {status === 'success' && (
        <CheckCircle2 className="mx-auto h-10 w-10 text-sage" />
      )}
      {status === 'error' && (
        <AlertCircle className="mx-auto h-10 w-10 text-red-600" />
      )}

      <h1 className="mt-4 font-serif text-2xl font-bold text-espresso">
        {status === 'success'
          ? 'Email Verified'
          : status === 'verifying'
            ? 'Verifying...'
            : 'Verification Failed'}
      </h1>
      <p className="mt-2 text-xs text-cocoa">{message}</p>

      <Link
        href="/"
        className="mt-6 inline-block rounded-full bg-terracotta px-6 py-2.5 text-xs font-semibold text-white hover:bg-terracotta-dark"
      >
        Return to Backeri Menu
      </Link>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <Suspense fallback={<p className="text-xs text-cocoa">Loading...</p>}>
        <VerifyEmailInner />
      </Suspense>
    </main>
  );
}
