'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChefHat, KeyRound, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';

export default function AdminLoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('admin@backeri.local');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await login(email, password);
      if (user.role !== 'ADMIN' && user.role !== 'BAKER') {
        setError('This account has CUSTOMER role. Please sign in with a Baker or Admin account.');
        return;
      }
      router.push('/admin/board');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4 py-12">
      <div className="w-full max-w-md rounded-3xl border border-wheat bg-white p-8 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-espresso text-cream">
            <ChefHat className="h-6 w-6" />
          </div>
          <div>
            <h1 className="font-serif text-2xl font-bold text-espresso">
              Backeri Kitchen Portal
            </h1>
            <p className="text-xs text-cocoa">
              Role-Based Access Control (Baker &amp; Admin)
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-cocoa">
              Staff Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-wheat bg-cream/60 px-3.5 py-2.5 text-sm text-espresso"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-cocoa">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-wheat bg-cream/60 px-3.5 py-2.5 text-sm text-espresso"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-terracotta py-3 text-sm font-semibold text-white hover:bg-terracotta-dark disabled:opacity-60"
          >
            <KeyRound className="h-4 w-4" />
            {busy ? 'Signing in...' : 'Open Kitchen Dashboard'}
          </button>

          <div className="text-right">
            <Link
              href="/forgot-password"
              className="text-xs font-semibold text-terracotta hover:underline"
            >
              Forgot password?
            </Link>
          </div>
        </form>

        <div className="mt-6 rounded-2xl border border-wheat bg-parchment/70 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-cocoa">
            Quick Fill Demo Accounts (RBAC Testing)
          </p>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setEmail('admin@backeri.local');
                setPassword('password123');
              }}
              className="rounded-xl border border-wheat bg-white px-3 py-2 text-left text-xs hover:border-terracotta"
            >
              <span className="block font-bold text-espresso">Admin (Owner)</span>
              <span className="text-[10px] text-cocoa">Full access + Revenue</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setEmail('baker@backeri.local');
                setPassword('password123');
              }}
              className="rounded-xl border border-wheat bg-white px-3 py-2 text-left text-xs hover:border-terracotta"
            >
              <span className="block font-bold text-espresso">Baker (Staff)</span>
              <span className="text-[10px] text-cocoa">Board + Prep + Sold Out</span>
            </button>
          </div>
        </div>

        <div className="mt-5 text-center">
          <Link href="/" className="text-xs font-semibold text-cocoa hover:text-terracotta">
            ← Return to Customer Storefront
          </Link>
        </div>
      </div>
    </div>
  );
}
