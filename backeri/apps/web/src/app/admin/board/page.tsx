'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bell,
  BellOff,
  CheckCircle2,
  Clock,
  Flame,
  PackageCheck,
  Radio,
  RefreshCw,
  Truck,
  Volume2,
  XCircle,
} from 'lucide-react';
import { formatMoney, formatSlotWindow, getNextKitchenStatus } from '@backeri/shared';
import type { OrderStatus } from '@backeri/shared';
import { apiFetch, PUBLIC_API_URL } from '@/lib/api';
import { playKitchenChime } from '@/lib/chime';
import type { OrderDTO } from '@/lib/types';
import { useAuth } from '@/components/AuthProvider';

const COLUMNS: Array<{
  status: OrderStatus;
  title: string;
  accent: string;
  actionLabel?: string;
}> = [
  {
    status: 'PAID',
    title: 'Incoming (Paid)',
    accent: 'border-t-blue-500',
    actionLabel: 'Start Baking →',
  },
  {
    status: 'BAKING',
    title: 'In Oven / Decorating',
    accent: 'border-t-terracotta',
    actionLabel: 'Mark Ready & Notify →',
  },
  {
    status: 'READY',
    title: 'Ready for Pickup / Delivery',
    accent: 'border-t-sage',
    actionLabel: 'Complete Order ✓',
  },
  {
    status: 'COMPLETED',
    title: 'Completed',
    accent: 'border-t-stone-400',
  },
];

export default function LiveOrderBoardPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<OrderDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [sseConnected, setSseConnected] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;

  const fetchOrders = useCallback(async () => {
    try {
      const data = await apiFetch<{ orders: OrderDTO[] }>(
        '/api/v1/admin/orders?limit=100'
      );
      setOrders(data.orders);
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Connect to live SSE stream backed by Redis Pub/Sub
  useEffect(() => {
    const source = new EventSource(`${PUBLIC_API_URL}/api/v1/admin/events`, {
      withCredentials: true,
    });

    source.addEventListener('connected', () => {
      setSseConnected(true);
    });

    source.addEventListener('order.created', (ev) => {
      try {
        const parsed = JSON.parse((ev as MessageEvent).data) as {
          payload: OrderDTO;
        };
        const incoming = parsed.payload;
        setOrders((prev) => {
          if (prev.some((o) => o.id === incoming.id)) return prev;
          return [incoming, ...prev];
        });
        if (soundRef.current) {
          playKitchenChime();
        }
        setToast(
          `New paid order ${incoming.orderNumber} from ${incoming.user.name}!`
        );
        setTimeout(() => setToast(null), 5000);
      } catch {
        fetchOrders();
      }
    });

    source.addEventListener('order.status_updated', (ev) => {
      try {
        const parsed = JSON.parse((ev as MessageEvent).data) as {
          payload: { order: OrderDTO };
        };
        const updated = parsed.payload.order;
        setOrders((prev) => {
          if (updated.status === 'CANCELLED') {
            return prev.filter((o) => o.id !== updated.id);
          }
          const exists = prev.some((o) => o.id === updated.id);
          if (!exists) return [updated, ...prev];
          return prev.map((o) => (o.id === updated.id ? updated : o));
        });
      } catch {
        fetchOrders();
      }
    });

    source.onerror = () => {
      setSseConnected(false);
    };

    return () => {
      source.close();
    };
  }, [fetchOrders]);

  const handleTransition = async (order: OrderDTO, targetStatus: OrderStatus) => {
    setUpdatingId(order.id);
    try {
      const res = await apiFetch<{ order: OrderDTO }>(
        `/api/v1/admin/orders/${order.id}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status: targetStatus }),
        }
      );
      setOrders((prev) =>
        res.order.status === 'CANCELLED'
          ? prev.filter((o) => o.id !== order.id)
          : prev.map((o) => (o.id === order.id ? res.order : o))
      );
      if (targetStatus === 'READY') {
        setToast(`Order ${order.orderNumber} marked READY — pickup SMS/Email sent!`);
        setTimeout(() => setToast(null), 4000);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Status update failed');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-espresso">
            Live Kitchen Order Board
          </h1>
          <p className="mt-0.5 text-xs text-cocoa">
            Real-time Kanban synchronized via Redis Pub/Sub &amp; Server-Sent Events
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
              sseConnected
                ? 'bg-sage/15 text-sage'
                : 'bg-amber-100 text-amber-800'
            }`}
          >
            <Radio className={`h-3.5 w-3.5 ${sseConnected ? 'animate-pulse' : ''}`} />
            {sseConnected ? 'Live Stream Active' : 'Reconnecting...'}
          </span>

          <button
            onClick={() => setSoundEnabled((s) => !s)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-wheat bg-white px-3 py-1.5 text-xs font-semibold text-espresso hover:border-terracotta"
          >
            {soundEnabled ? (
              <Bell className="h-3.5 w-3.5 text-terracotta" />
            ) : (
              <BellOff className="h-3.5 w-3.5 text-cocoa/50" />
            )}
            {soundEnabled ? 'Chime On' : 'Muted'}
          </button>

          <button
            onClick={() => playKitchenChime()}
            title="Test kitchen bell audio"
            className="inline-flex items-center gap-1 rounded-xl border border-wheat bg-white px-3 py-1.5 text-xs font-semibold text-cocoa hover:border-espresso"
          >
            <Volume2 className="h-3.5 w-3.5" />
            Test Chime
          </button>

          <button
            onClick={fetchOrders}
            className="inline-flex items-center gap-1.5 rounded-xl bg-espresso px-3.5 py-1.5 text-xs font-semibold text-cream hover:bg-terracotta"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Sync
          </button>
        </div>
      </div>

      {toast && (
        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-sage bg-sage/15 px-4 py-3 text-sm font-semibold text-espresso shadow-xs">
          <Flame className="h-4 w-4 text-terracotta" />
          <span>{toast}</span>
        </div>
      )}

      {loading ? (
        <div className="mt-10 text-sm text-cocoa">Loading kitchen queue...</div>
      ) : (
        <div className="mt-6 grid gap-4 xl:grid-cols-4 md:grid-cols-2">
          {COLUMNS.map((col) => {
            const colOrders = orders.filter((o) => o.status === col.status);
            return (
              <section
                key={col.status}
                className={`flex min-h-[520px] flex-col rounded-2xl border border-wheat border-t-4 ${col.accent} bg-parchment/60 p-3.5`}
              >
                <div className="mb-3 flex items-center justify-between px-1">
                  <h2 className="font-serif text-base font-bold text-espresso">
                    {col.title}
                  </h2>
                  <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-espresso shadow-2xs">
                    {colOrders.length}
                  </span>
                </div>

                <div className="flex-1 space-y-3">
                  {colOrders.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-wheat bg-white/50 p-6 text-center text-xs text-cocoa/70">
                      No orders in this stage
                    </div>
                  ) : (
                    colOrders.map((order) => {
                      const nextStatus = getNextKitchenStatus(order.status);
                      return (
                        <article
                          key={order.id}
                          className="rounded-xl border border-wheat bg-white p-4 shadow-xs"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="font-serif text-base font-bold text-espresso">
                                {order.orderNumber}
                              </span>
                              <p className="text-xs font-medium text-cocoa">
                                {order.user.name}
                              </p>
                            </div>
                            <span className="text-xs font-bold text-espresso">
                              {formatMoney(order.totalAmountCents)}
                            </span>
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                            <span className="inline-flex items-center gap-1 rounded-md bg-parchment px-2 py-0.5 font-semibold text-espresso">
                              <Clock className="h-3 w-3 text-terracotta" />
                              {order.slot.date.slice(5, 10)} •{' '}
                              {formatSlotWindow(
                                order.slot.startTime,
                                order.slot.endTime
                              )}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-bold ${
                                order.fulfillmentType === 'DELIVERY'
                                  ? 'bg-amber-100 text-amber-900'
                                  : 'bg-sage/15 text-sage'
                              }`}
                            >
                              {order.fulfillmentType === 'DELIVERY' ? (
                                <Truck className="h-3 w-3" />
                              ) : (
                                <PackageCheck className="h-3 w-3" />
                              )}
                              {order.fulfillmentType}
                            </span>
                          </div>

                          <ul className="mt-3 space-y-2 border-t border-wheat/60 pt-2.5 text-xs">
                            {order.items.map((item) => (
                              <li key={item.id}>
                                <div className="flex justify-between font-semibold text-espresso">
                                  <span>
                                    {item.quantity}× {item.variant.product.name}
                                  </span>
                                </div>
                                <p className="text-[11px] text-cocoa">
                                  {item.variant.label}
                                </p>
                                {item.customNotes?.inscription && (
                                  <p className="mt-1 rounded bg-amber-50 border border-amber-200 px-2 py-1 text-[11px] font-semibold text-amber-900">
                                    Pipe: &ldquo;{item.customNotes.inscription}&rdquo;
                                  </p>
                                )}
                                {item.customNotes?.dietaryNotes && (
                                  <p className="mt-0.5 text-[11px] italic text-cocoa">
                                    Note: {item.customNotes.dietaryNotes}
                                  </p>
                                )}
                                {item.customNotes?.referenceImageUrl && (
                                  <a
                                    href={item.customNotes.referenceImageUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-semibold text-terracotta underline"
                                  >
                                    <img
                                      src={item.customNotes.referenceImageUrl}
                                      alt="Cake reference"
                                      className="h-7 w-7 rounded border border-wheat object-cover"
                                    />
                                    Inspiration Photo
                                  </a>
                                )}
                              </li>
                            ))}
                          </ul>

                          {nextStatus && (
                            <div className="mt-3.5 flex items-center gap-2 pt-2 border-t border-wheat/60">
                              <button
                                type="button"
                                disabled={updatingId === order.id}
                                onClick={() => handleTransition(order, nextStatus)}
                                className="flex-1 rounded-lg bg-espresso py-2 text-xs font-semibold text-cream transition hover:bg-terracotta disabled:opacity-50"
                              >
                                {updatingId === order.id
                                  ? 'Updating...'
                                  : col.actionLabel}
                              </button>

                              {user?.role === 'ADMIN' && (
                                <button
                                  type="button"
                                  disabled={updatingId === order.id}
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        `Cancel & refund order ${order.orderNumber}?`
                                      )
                                    ) {
                                      handleTransition(order, 'CANCELLED');
                                    }
                                  }}
                                  title="Cancel & Refund (Admin only)"
                                  className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50"
                                >
                                  <XCircle className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          )}

                          {order.status === 'COMPLETED' && (
                            <div className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-sage">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Fulfilled
                            </div>
                          )}
                        </article>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
