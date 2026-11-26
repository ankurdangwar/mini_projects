'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  CalendarCog,
  ChefHat,
  ClipboardList,
  KanbanSquare,
  LogOut,
  Store,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, logout } = useAuth();

  const isLoginPage = pathname === '/admin/login';

  useEffect(() => {
    if (loading || isLoginPage) return;
    if (!user || (user.role !== 'BAKER' && user.role !== 'ADMIN')) {
      router.replace('/admin/login');
    }
  }, [loading, isLoginPage, user, router]);

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (loading || !user || (user.role !== 'BAKER' && user.role !== 'ADMIN')) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream text-sm text-cocoa">
        Verifying staff session...
      </div>
    );
  }

  const navItems = [
    {
      href: '/admin/board',
      label: 'Live Order Board',
      icon: KanbanSquare,
      roles: ['BAKER', 'ADMIN'],
    },
    {
      href: '/admin/prep-sheet',
      label: 'Daily Prep Sheet',
      icon: ClipboardList,
      roles: ['BAKER', 'ADMIN'],
    },
    {
      href: '/admin/slots',
      label: 'Slots & Sold Out',
      icon: CalendarCog,
      roles: ['BAKER', 'ADMIN'],
    },
    {
      href: '/admin/analytics',
      label: 'Analytics & Logs',
      icon: BarChart3,
      roles: ['ADMIN'],
    },
  ].filter((item) => item.roles.includes(user.role));

  return (
    <div className="flex min-h-screen bg-cream">
      {/* Staff Sidebar */}
      <aside className="no-print flex w-64 shrink-0 flex-col border-r border-wheat bg-espresso text-cream">
        <div className="flex items-center gap-2.5 border-b border-white/10 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-terracotta text-white">
            <ChefHat className="h-5 w-5" />
          </div>
          <div>
            <p className="font-serif text-lg font-bold leading-none">Backeri Ops</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-wheat/80">
              Kitchen &amp; Admin
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
                  active
                    ? 'bg-terracotta text-white shadow-sm'
                    : 'text-wheat/85 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="rounded-xl bg-white/10 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs font-bold text-white">{user.name}</p>
              <span className="rounded-full bg-terracotta px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                {user.role}
              </span>
            </div>
            <p className="mt-0.5 truncate text-[11px] text-wheat/75">{user.email}</p>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-wheat/80 hover:text-white"
            >
              <Store className="h-3.5 w-3.5" />
              Storefront
            </Link>
            <button
              onClick={async () => {
                await logout();
                router.push('/admin/login');
              }}
              className="inline-flex items-center gap-1 text-wheat/80 hover:text-red-300"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Operations Content */}
      <main className="min-w-0 flex-1 overflow-y-auto p-6 lg:p-8">{children}</main>
    </div>
  );
}
