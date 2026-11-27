'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, KeyRound } from 'lucide-react';
import { apiFetch } from '@/lib/api';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const initialToken = searchParams.get('token') ?? '';

  const [token, setToken] = useState(initialToken);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      await apiFetch('/api/v1/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: token.trim(), newPassword }),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-3xl border border-wheat bg-white p-8 shadow-sm">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-parchment text-terracotta">
        <KeyRound className="h-5 w-5" />
      </div>
      <h1 className="mt-4 font-serif text-2xl font-bold text-espresso">
        Choose a new password
      </h1>

      {done ? (
        <div className="mt-5 space-y-4">
          <div className="flex items-start gap-2 rounded-2xl border border-sage/40 bg-sage/10 p-4 text-xs text-espresso">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sage" />
            <span>
              Your password has been updated! You can now sign in with your new
              password.
            </span>
          </div>
          <div className="flex gap-3">
            <Link
              href="/checkout"
              className="flex-1 rounded-xl bg-terracotta py-2.5 text-center text-xs font-semibold text-white"
            >
              Customer Sign In
            </Link>
            <Link
              href="/admin/login"
              className="flex-1 rounded-xl border border-wheat bg-cream py-2.5 text-center text-xs font-semibold text-espresso"
            >
              Staff Login
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {!initialToken && (
            <div>
              <label className="block text-xs font-semibold text-cocoa">
                Reset Token
              </label>
              <input
                type="text"
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="mt-1 w-full rounded-xl border border-wheat bg-cream/60 px-3.5 py-2 text-xs font-mono"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-cocoa">
              New Password (min 8 characters)
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-wheat bg-cream/60 px-3.5 py-2.5 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-cocoa">
              Confirm New Password
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-wheat bg-cream/60 px-3.5 py-2.5 text-sm"
            />
          </div>

          {error && <p className="text-xs font-medium text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={busy || !token}
            className="w-full rounded-xl bg-terracotta py-3 text-sm font-semibold text-white hover:bg-terracotta-dark disabled:opacity-50"
          >
            {busy ? 'Updating...' : 'Save New Password'}
          </button>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <Suspense fallback={<p className="text-xs text-cocoa">Loading...</p>}>
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}
