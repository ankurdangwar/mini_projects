'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChefHat,
  Clock,
  MapPin,
  RefreshCw,
} from 'lucide-react';
import { formatMoney, formatSlotWindow } from '@backeri/shared';
import { apiFetch } from '@/lib/api';
import type { OrderDTO } from '@/lib/types';

const STEPS = [
  { key: 'PAID', label: 'Confirmed' },
  { key: 'BAKING', label: 'In Oven / Decorating' },
  { key: 'READY', label: 'Ready for Pickup' },
  { key: 'COMPLETED', label: 'Completed' },
];

export default function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [order, setOrder] = useState<OrderDTO | null>(null);
  const [error, setError] = useState('');

  const loadOrder = () => {
    apiFetch<{ order: OrderDTO }>(`/api/v1/orders/${id}`)
      .then((res) => setOrder(res.order))
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Unable to load order')
      );
  };

  useEffect(() => {
    loadOrder();
    const timer = setInterval(loadOrder, 6000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <Link href="/orders" className="mt-4 inline-block text-xs underline">
          Back to orders
        </Link>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-cocoa">
        Loading order receipt...
      </main>
    );
  }

  const activeIdx = STEPS.findIndex((s) => s.key === order.status);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between">
        <Link
          href="/orders"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-cocoa hover:text-terracotta"
        >
          <ArrowLeft className="h-4 w-4" />
          All Orders
        </Link>
        <button
          onClick={loadOrder}
          className="inline-flex items-center gap-1 text-xs font-semibold text-cocoa hover:text-terracotta"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh Status
        </button>
      </div>

      <div className="mt-5 rounded-3xl border border-wheat bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-wheat pb-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-terracotta">
              Order Receipt &amp; Tracker
            </p>
            <h1 className="mt-1 font-serif text-3xl font-bold text-espresso">
              {order.orderNumber}
            </h1>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-cocoa">
              <Calendar className="h-3.5 w-3.5 text-terracotta" />
              {order.slot.date.slice(0, 10)} •{' '}
              {formatSlotWindow(order.slot.startTime, order.slot.endTime)} •{' '}
              <strong>{order.fulfillmentType}</strong>
            </p>
          </div>
          <span className="rounded-full bg-espresso px-4 py-1.5 text-xs font-bold text-cream">
            {order.status}
          </span>
        </div>

        {/* Live Progress Stepper */}
        {order.status === 'CANCELLED' ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <strong>Order Cancelled:</strong>{' '}
            {order.cancelReason || 'Cancelled and refunded.'}
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-4 gap-2">
            {STEPS.map((step, idx) => {
              const done = activeIdx >= idx;
              return (
                <div key={step.key} className="text-center">
                  <div
                    className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full border-2 ${
                      done
                        ? 'border-sage bg-sage text-white'
                        : 'border-wheat bg-cream text-cocoa/50'
                    }`}
                  >
                    {done ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : step.key === 'BAKING' ? (
                      <ChefHat className="h-4 w-4" />
                    ) : (
                      <Clock className="h-4 w-4" />
                    )}
                  </div>
                  <p
                    className={`mt-2 text-[11px] font-semibold ${
                      done ? 'text-espresso' : 'text-cocoa/60'
                    }`}
                  >
                    {step.label}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {order.deliveryAddress && (
          <div className="mt-6 flex items-start gap-2 rounded-2xl bg-parchment/70 p-4 text-xs text-cocoa">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-terracotta" />
            <div>
              <p className="font-bold text-espresso">Delivery Address</p>
              <p>
                {order.deliveryAddress.line1}, {order.deliveryAddress.city}{' '}
                {order.deliveryAddress.postalCode}
              </p>
              {order.deliveryAddress.instructions && (
                <p className="mt-0.5 italic">{order.deliveryAddress.instructions}</p>
              )}
            </div>
          </div>
        )}

        {/* Line Items */}
        <ul className="mt-6 divide-y divide-wheat/70">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-4 py-4">
              <div className="flex gap-3">
                <img
                  src={item.variant.product.imageUrl}
                  alt={item.variant.product.name}
                  className="h-14 w-14 rounded-xl border border-wheat object-cover"
                />
                <div>
                  <p className="font-serif text-base font-bold text-espresso">
                    {item.quantity}× {item.variant.product.name}
                  </p>
                  <p className="text-xs text-cocoa">{item.variant.label}</p>
                  {item.customNotes?.inscription && (
                    <p className="mt-1 rounded bg-parchment px-2 py-0.5 text-xs text-espresso">
                      Inscription: &ldquo;{item.customNotes.inscription}&rdquo;
                    </p>
                  )}
                  {item.customNotes?.dietaryNotes && (
                    <p className="mt-1 text-xs text-cocoa">
                      Note: {item.customNotes.dietaryNotes}
                    </p>
                  )}
                  {item.customNotes?.referenceImageUrl && (
                    <a
                      href={item.customNotes.referenceImageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-xs font-semibold text-terracotta underline"
                    >
                      View attached inspiration photo
                    </a>
                  )}
                </div>
              </div>
              <span className="font-semibold text-espresso">
                {formatMoney(item.unitPriceCents * item.quantity)}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-center justify-between border-t border-wheat pt-4 font-serif text-xl font-bold text-espresso">
          <span>Total Paid</span>
          <span>{formatMoney(order.totalAmountCents)}</span>
        </div>
      </div>
    </main>
  );
}
