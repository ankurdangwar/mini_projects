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
    <main className="min-h-screen bg-surface">
      {apiOffline ? (
        <section className="mx-auto max-w-2xl px-4 py-16 text-center">
          <div className="rounded-2xl border border-coral/30 bg-white p-8 shadow-xs">
            <h2 className="text-lg font-extrabold text-ink">
              Bakery API is currently offline
            </h2>
            <p className="mt-2 text-xs text-muted">
              Start PostgreSQL &amp; Redis via <code>docker compose up -d</code> and run{' '}
              <code>npm run dev</code> to load the live menu.
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
