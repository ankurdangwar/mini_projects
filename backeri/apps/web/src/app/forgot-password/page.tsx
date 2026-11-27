'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Mail } from 'lucide-react';
import { apiFetch } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentMsg, setSentMsg] = useState('');
  const [devToken, setDevToken] = useState<string | null>(null);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await apiFetch<{
        ok: boolean;
        message: string;
        devResetToken?: string;
      }>('/api/v1/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setSentMsg(res.message);
      setDevToken(res.devResetToken ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <Link
        href="/checkout"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-cocoa hover:text-terracotta"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Sign In
      </Link>

      <div className="mt-4 rounded-3xl border border-wheat bg-white p-8 shadow-sm">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-parchment text-terracotta">
          <Mail className="h-5 w-5" />
        </div>
        <h1 className="mt-4 font-serif text-2xl font-bold text-espresso">
          Reset your password
        </h1>
        <p className="mt-1 text-xs text-cocoa">
          Enter your email address and we&apos;ll queue a one-time reset link valid
          for 1 hour.
        </p>

        {sentMsg ? (
          <div className="mt-5 space-y-3">
            <div className="flex items-start gap-2 rounded-2xl border border-sage/40 bg-sage/10 p-4 text-xs text-espresso">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sage" />
              <span>{sentMsg}</span>
            </div>

            {devToken && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                <p className="font-bold">Sandbox Mode Preview</p>
                <p className="mt-1">
                  In production this link is sent only via email. In local sandbox
                  mode you can open it directly:
                </p>
                <Link
                  href={`/reset-password?token=${devToken}`}
                  className="mt-2 inline-block rounded-lg bg-espresso px-3.5 py-2 font-semibold text-cream hover:bg-terracotta"
                >
                  Open Password Reset Link →
                </Link>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-cocoa">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-1 w-full rounded-xl border border-wheat bg-cream/60 px-3.5 py-2.5 text-sm text-espresso"
              />
            </div>

            {error && <p className="text-xs font-medium text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-terracotta py-3 text-sm font-semibold text-white hover:bg-terracotta-dark disabled:opacity-50"
            >
              {busy ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
