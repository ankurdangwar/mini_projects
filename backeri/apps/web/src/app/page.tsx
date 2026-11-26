import Link from 'next/link';
import { CalendarClock, Flame, ShieldCheck } from 'lucide-react';
import { serverFetch } from '@/lib/api';
import type { MenuResponse } from '@/lib/types';
import { StorefrontCatalog } from '@/components/StorefrontCatalog';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let menu: MenuResponse = {
    categories: [],
    products: [],
    generatedAt: new Date().toISOString(),
  };
  let apiOffline = false;

  try {
    menu = await serverFetch<MenuResponse>('/api/v1/menu');
  } catch {
    apiOffline = true;
  }

  return (
    <main>
      {/* Hero Section */}
      <section className="border-b border-wheat/80 bg-gradient-to-b from-parchment/90 to-cream">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-12 lg:items-center lg:py-20">
          <div className="lg:col-span-7">
            <span className="inline-flex items-center gap-2 rounded-full border border-wheat bg-white px-3.5 py-1 text-xs font-semibold text-terracotta shadow-xs">
              <Flame className="h-3.5 w-3.5" />
              Small-Batch Craft • Live Kitchen Capacity Scheduling
            </span>
            <h1 className="mt-4 font-serif text-4xl font-bold leading-tight text-espresso sm:text-5xl">
              Warm sourdough &amp; bespoke cakes, reserved straight from our ovens.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-cocoa sm:text-base">
              Order daily viennoiserie or customize a celebration cake with a personal
              inscription and inspiration photo. Every pickup window is live-capped to
              protect oven quality and guarantee on-time bakes.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <a
                href="#menu"
                className="rounded-full bg-terracotta px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-terracotta-dark"
              >
                Explore Daily Menu
              </a>
              <Link
                href="/admin/board"
                className="rounded-full border border-espresso/20 bg-white px-6 py-3 text-sm font-semibold text-espresso transition hover:border-espresso"
              >
                Open Kitchen Dashboard
              </Link>
            </div>
          </div>

          <div className="grid gap-3.5 sm:grid-cols-3 lg:col-span-5 lg:grid-cols-1">
            <div className="flex items-start gap-3.5 rounded-2xl border border-wheat bg-white/90 p-4 shadow-xs">
              <div className="rounded-xl bg-parchment p-2.5 text-terracotta">
                <CalendarClock className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-serif text-sm font-bold text-espresso">
                  Smart Lead-Time Slots
                </h3>
                <p className="mt-0.5 text-xs text-cocoa">
                  Pickup &amp; delivery windows automatically respect cake prep times and
                  hold your slot for 10 minutes during checkout.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 rounded-2xl border border-wheat bg-white/90 p-4 shadow-xs">
              <div className="rounded-xl bg-parchment p-2.5 text-sage">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-serif text-sm font-bold text-espresso">
                  Guaranteed Oven Capacity
                </h3>
                <p className="mt-0.5 text-xs text-cocoa">
                  ACID slot locking ensures no Saturday morning overbooking — when your
                  order is confirmed, your oven spot is locked.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {apiOffline ? (
        <section className="mx-auto max-w-3xl px-4 py-16 text-center">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-8">
            <h2 className="font-serif text-xl font-bold text-red-900">
              Backend API is currently unreachable
            </h2>
            <p className="mt-2 text-sm text-red-700">
              Start PostgreSQL &amp; Redis via <code>docker compose up -d</code> and run{' '}
              <code>npm run dev:api</code> to load the live bakery catalog.
            </p>
          </div>
        </section>
      ) : (
        <StorefrontCatalog
          categories={menu.categories}
          products={menu.products}
        />
      )}
    </main>
  );
}
