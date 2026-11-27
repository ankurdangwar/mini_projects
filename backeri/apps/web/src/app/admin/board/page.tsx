'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  BellOff,
  Calendar,
  CheckCircle2,
  Clock,
  Flame,
  MapPin,
  PackageCheck,
  Printer,
  Radio,
  RefreshCw,
  Search,
  Truck,
  Volume2,
  X,
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

function isoDateWithOffset(days: number): string {
  const now = new Date();
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days)
  );
  return d.toISOString().slice(0, 10);
}

export default function LiveOrderBoardPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<OrderDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [sseConnected, setSseConnected] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Filters & Box Sticker Modal
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState(''); // '' = All Dates
  const [fulfillmentFilter, setFulfillmentFilter] = useState<
    'ALL' | 'PICKUP' | 'DELIVERY'
  >('ALL');
  const [ticketOrder, setTicketOrder] = useState<OrderDTO | null>(null);

  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;

  const fetchOrders = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ limit: '100' });
      if (dateFilter) qs.set('date', dateFilter);
      if (searchQuery.trim()) qs.set('q', searchQuery.trim());
      if (fulfillmentFilter !== 'ALL') qs.set('fulfillmentType', fulfillmentFilter);

      const data = await apiFetch<{ orders: OrderDTO[] }>(
        `/api/v1/admin/orders?${qs.toString()}`
      );
      setOrders(data.orders);
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    } finally {
      setLoading(false);
    }
  }, [dateFilter, searchQuery, fulfillmentFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchOrders();
    }, 180);
    return () => clearTimeout(timer);
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
          payload: { order?: OrderDTO } & Partial<OrderDTO>;
        };
        const updated = (parsed.payload.order ?? parsed.payload) as OrderDTO;
        if (!updated?.id) return;
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

  // Client-side filter ensures SSE-pushed orders also respect active filters immediately
  const visibleOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return orders.filter((order) => {
      if (dateFilter && order.slot.date.slice(0, 10) !== dateFilter) {
        return false;
      }
      if (
        fulfillmentFilter !== 'ALL' &&
        order.fulfillmentType !== fulfillmentFilter
      ) {
        return false;
      }
      if (q) {
        const matchesNum = order.orderNumber.toLowerCase().includes(q);
        const matchesName = order.user.name.toLowerCase().includes(q);
        const matchesEmail = order.user.email.toLowerCase().includes(q);
        if (!matchesNum && !matchesName && !matchesEmail) return false;
      }
      return true;
    });
  }, [orders, searchQuery, dateFilter, fulfillmentFilter]);

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
        setToast(`Order ${order.orderNumber} marked READY — pickup SMS/Email queued!`);
        setTimeout(() => setToast(null), 4000);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Status update failed');
    } finally {
      setUpdatingId(null);
    }
  };

  const todayIso = isoDateWithOffset(0);
  const tomorrowIso = isoDateWithOffset(1);

  return (
    <div>
      {/* Board UI (hidden when printing a single box sticker) */}
      <div className={ticketOrder ? 'no-print' : ''}>
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

        {/* Filter & Search Bar */}
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-wheat bg-white p-3.5 shadow-2xs">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-cocoa/50" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search order # (BK-1001), customer name, or email..."
              className="w-full rounded-xl border border-wheat bg-cream/60 py-2 pl-9 pr-3 text-xs text-espresso focus:border-terracotta focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setDateFilter('')}
              className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${
                dateFilter === ''
                  ? 'border-espresso bg-espresso text-cream'
                  : 'border-wheat bg-cream/50 text-cocoa'
              }`}
            >
              All Dates
            </button>
            <button
              onClick={() => setDateFilter(todayIso)}
              className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${
                dateFilter === todayIso
                  ? 'border-espresso bg-espresso text-cream'
                  : 'border-wheat bg-cream/50 text-cocoa'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setDateFilter(tomorrowIso)}
              className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${
                dateFilter === tomorrowIso
                  ? 'border-espresso bg-espresso text-cream'
                  : 'border-wheat bg-cream/50 text-cocoa'
              }`}
            >
              Tomorrow
            </button>
            <div className="flex items-center gap-1.5 rounded-xl border border-wheat bg-cream/50 px-2.5 py-1.5 text-xs">
              <Calendar className="h-3.5 w-3.5 text-terracotta" />
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="bg-transparent font-semibold text-espresso focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-1 rounded-xl border border-wheat bg-cream/50 p-1 text-xs">
            {(['ALL', 'PICKUP', 'DELIVERY'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFulfillmentFilter(f)}
                className={`rounded-lg px-2.5 py-1 font-semibold ${
                  fulfillmentFilter === f
                    ? 'bg-espresso text-cream'
                    : 'text-cocoa hover:text-espresso'
                }`}
              >
                {f === 'ALL' ? 'All' : f === 'PICKUP' ? 'Pickup' : 'Delivery'}
              </button>
            ))}
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
              const colOrders = visibleOrders.filter((o) => o.status === col.status);
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
                        No matching orders
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
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setTicketOrder(order)}
                                  title="Print individual box sticker"
                                  className="rounded-lg border border-wheat p-1.5 text-cocoa hover:border-espresso hover:text-espresso"
                                >
                                  <Printer className="h-3.5 w-3.5" />
                                </button>
                                <span className="text-xs font-bold text-espresso">
                                  {formatMoney(order.totalAmountCents)}
                                </span>
                              </div>
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

      {/* Printable Individual Order Box Sticker Modal */}
      {ticketOrder && (
        <div className="print-ticket-modal fixed inset-0 z-50 flex items-center justify-center bg-espresso/60 p-4 backdrop-blur-xs">
          <div className="print-ticket-card w-full max-w-sm rounded-2xl border-2 border-espresso bg-white p-5 shadow-2xl">
            <div className="no-print mb-3 flex items-center justify-between border-b border-wheat pb-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-cocoa">
                Bakery Box Sticker Preview
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-terracotta px-3 py-1.5 text-xs font-semibold text-white hover:bg-terracotta-dark"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print Sticker
                </button>
                <button
                  onClick={() => setTicketOrder(null)}
                  className="rounded-lg p-1 text-cocoa hover:bg-parchment"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Thermal Label Body */}
            <div className="font-mono text-xs text-black">
              <div className="flex items-baseline justify-between border-b-2 border-black pb-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest">
                    BACKERI ARTISAN BAKEHOUSE
                  </p>
                  <p className="text-2xl font-black tracking-tight">
                    {ticketOrder.orderNumber}
                  </p>
                </div>
                <span className="rounded border-2 border-black px-2 py-0.5 text-xs font-black uppercase">
                  {ticketOrder.fulfillmentType}
                </span>
              </div>

              <div className="border-b border-dashed border-black py-2">
                <p className="font-bold">
                  WINDOW: {ticketOrder.slot.date.slice(0, 10)}{' '}
                  {formatSlotWindow(
                    ticketOrder.slot.startTime,
                    ticketOrder.slot.endTime
                  )}
                </p>
                <p className="mt-1 font-bold">
                  CUSTOMER: {ticketOrder.user.name}
                </p>
                {ticketOrder.user.phone && <p>PHONE: {ticketOrder.user.phone}</p>}
                {ticketOrder.deliveryAddress && (
                  <p className="mt-1 flex items-start gap-1">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      {ticketOrder.deliveryAddress.line1},{' '}
                      {ticketOrder.deliveryAddress.city}{' '}
                      {ticketOrder.deliveryAddress.postalCode}
                      {ticketOrder.deliveryAddress.instructions
                        ? ` (${ticketOrder.deliveryAddress.instructions})`
                        : ''}
                    </span>
                  </p>
                )}
              </div>

              <div className="py-2.5 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider">
                  PACKING CHECKLIST:
                </p>
                {ticketOrder.items.map((item) => (
                  <div
                    key={item.id}
                    className="border-b border-dotted border-stone-400 pb-2 last:border-b-0"
                  >
                    <p className="text-sm font-black">
                      [ ] {item.quantity}x {item.variant.product.name}
                    </p>
                    <p className="pl-5 text-[11px]">{item.variant.label}</p>
                    {item.customNotes?.inscription && (
                      <p className="mt-1 border border-black bg-stone-100 px-2 py-1 font-bold">
                        INSCRIPTION: &quot;{item.customNotes.inscription}&quot;
                      </p>
                    )}
                    {item.customNotes?.dietaryNotes && (
                      <p className="mt-0.5 pl-5 font-bold">
                        NOTE: {item.customNotes.dietaryNotes}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-2 flex items-center justify-between border-t-2 border-black pt-2 text-[11px] font-bold">
                <span>STATUS: {ticketOrder.status}</span>
                <span>PAID: {formatMoney(ticketOrder.totalAmountCents)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
