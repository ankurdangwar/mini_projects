'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Calendar, ChevronRight, Package } from 'lucide-react';
import { formatMoney, formatSlotWindow } from '@backeri/shared';
import { apiFetch } from '@/lib/api';
import type { OrderDTO } from '@/lib/types';
import { useAuth } from '@/components/AuthProvider';

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  PAID: 'bg-blue-100 text-blue-800',
  BAKING: 'bg-orange-100 text-orange-800',
  READY: 'bg-emerald-100 text-emerald-800',
  COMPLETED: 'bg-stone-200 text-stone-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

export default function OrdersListPage() {
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<OrderDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }

    apiFetch<{ orders: OrderDTO[] }>('/api/v1/orders')
      .then((res) => setOrders(res.orders))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, authLoading]);

  if (!authLoading && !user) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <Package className="mx-auto h-10 w-10 text-wheat" />
        <h1 className="mt-3 font-serif text-2xl font-bold text-espresso">
          Sign in to view your orders
        </h1>
        <p className="mt-1 text-sm text-cocoa">
          Track live baking status and pickup windows for all your bakery orders.
        </p>
        <Link
          href="/checkout"
          className="mt-5 inline-block rounded-full bg-terracotta px-6 py-2.5 text-sm font-semibold text-white"
        >
          Sign In
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="font-serif text-3xl font-bold text-espresso">My Orders</h1>
      <p className="mt-1 text-sm text-cocoa">
        Live status updates from our ovens to your pickup window.
      </p>

      {loading ? (
        <p className="mt-8 text-sm text-cocoa">Loading your orders...</p>
      ) : orders.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-wheat bg-white p-10 text-center">
          <p className="font-serif text-lg font-bold text-espresso">No orders yet</p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-full bg-terracotta px-5 py-2 text-xs font-semibold text-white"
          >
            Order Fresh Bakes
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-3.5">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/orders/${order.id}`}
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-wheat bg-white p-5 shadow-xs transition hover:border-terracotta"
            >
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="font-serif text-lg font-bold text-espresso">
                    {order.orderNumber}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                      STATUS_BADGE[order.status] ?? 'bg-parchment text-cocoa'
                    }`}
                  >
                    {order.status}
                  </span>
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-cocoa">
                  <Calendar className="h-3.5 w-3.5 text-terracotta" />
                  {order.slot.date.slice(0, 10)} •{' '}
                  {formatSlotWindow(order.slot.startTime, order.slot.endTime)} •{' '}
                  {order.fulfillmentType}
                </p>
                <p className="mt-1 text-xs text-cocoa">
                  {order.items
                    .map((i) => `${i.quantity}× ${i.variant.product.name}`)
                    .join(', ')}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="font-serif text-lg font-bold text-espresso">
                  {formatMoney(order.totalAmountCents)}
                </span>
                <ChevronRight className="h-5 w-5 text-cocoa/60" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
