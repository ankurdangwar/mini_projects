'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  CalendarOff,
  CheckCircle2,
  Lock,
  Minus,
  Plus,
  RefreshCw,
  Unlock,
} from 'lucide-react';
import { formatMoney, formatSlotWindow } from '@backeri/shared';
import { apiFetch } from '@/lib/api';
import type { MenuResponse, ProductDTO, TimeSlotDTO } from '@/lib/types';
import { useAuth } from '@/components/AuthProvider';

function upcomingDates(count = 10): string[] {
  const res: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + i)
    );
    res.push(d.toISOString().slice(0, 10));
  }
  return res;
}

export default function SlotsAndInventoryPage() {
  const { user } = useAuth();
  const dates = useMemo(() => upcomingDates(10), []);
  const [selectedDate, setSelectedDate] = useState(dates[1]);
  const [slots, setSlots] = useState<TimeSlotDTO[]>([]);
  const [products, setProducts] = useState<ProductDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const loadData = async (targetDate: string) => {
    setLoading(true);
    try {
      const [slotsRes, menuRes] = await Promise.all([
        apiFetch<{ slots: TimeSlotDTO[] }>(
          `/api/v1/admin/slots?date=${targetDate}`
        ),
        apiFetch<MenuResponse>('/api/v1/admin/products'),
      ]);
      setSlots(slotsRes.slots);
      setProducts(menuRes.products);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(selectedDate);
  }, [selectedDate]);

  const flash = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3500);
  };

  const handleUpdateSlot = async (
    slot: TimeSlotDTO,
    patch: { maxOrders?: number; isClosed?: boolean }
  ) => {
    try {
      await apiFetch(`/api/v1/admin/slots/${slot.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      flash('Kitchen slot updated.');
      loadData(selectedDate);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update slot');
    }
  };

  const handleBlackout = async (isClosed: boolean) => {
    try {
      await apiFetch('/api/v1/admin/slots/blackout', {
        method: 'POST',
        body: JSON.stringify({ date: selectedDate, isClosed }),
      });
      flash(
        isClosed
          ? `Blacked out all slots on ${selectedDate} (Holiday).`
          : `Reopened all slots on ${selectedDate}.`
      );
      loadData(selectedDate);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Blackout failed');
    }
  };

  const handleToggleProduct = async (product: ProductDTO) => {
    try {
      const res = await apiFetch<{ product: ProductDTO }>(
        `/api/v1/admin/products/${product.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ isActive: !product.isActive }),
        }
      );
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? res.product : p))
      );
      flash(
        `${product.name} marked ${
          res.product.isActive ? 'Available' : 'Sold Out'
        } (menu cache invalidated).`
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to toggle availability');
    }
  };

  const allClosed = slots.length > 0 && slots.every((s) => s.isClosed);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-espresso">
            Calendar, Slot Caps &amp; Sold-Out Controls
          </h1>
          <p className="mt-0.5 text-xs text-cocoa">
            Adjust kitchen throughput per pickup window, black out holidays, or mark
            items Sold Out in one click.
          </p>
        </div>

        <button
          onClick={() => loadData(selectedDate)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-espresso px-3.5 py-2 text-xs font-semibold text-cream hover:bg-terracotta"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {message && (
        <div className="rounded-xl border border-sage/40 bg-sage/15 px-4 py-2.5 text-xs font-semibold text-espresso">
          {message}
        </div>
      )}

      {/* Time Slots Manager */}
      <section className="rounded-2xl border border-wheat bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-xl font-bold text-espresso">
            Pickup &amp; Delivery Slot Throughput
          </h2>

          {user?.role === 'ADMIN' && (
            <button
              onClick={() => handleBlackout(!allClosed)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition ${
                allClosed
                  ? 'bg-sage text-white hover:opacity-95'
                  : 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
              }`}
            >
              <CalendarOff className="h-3.5 w-3.5" />
              {allClosed
                ? `Reopen All Slots (${selectedDate})`
                : `Blackout Holiday (${selectedDate})`}
            </button>
          )}
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
          {dates.map((d) => (
            <button
              key={d}
              onClick={() => setSelectedDate(d)}
              className={`shrink-0 rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
                selectedDate === d
                  ? 'border-espresso bg-espresso text-cream'
                  : 'border-wheat bg-cream/60 text-cocoa hover:border-terracotta'
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="mt-6 text-xs text-cocoa">Loading slots...</p>
        ) : (
          <div className="mt-5 grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
            {slots.map((slot) => {
              const pct =
                slot.maxOrders > 0
                  ? Math.min(100, Math.round((slot.bookedOrders / slot.maxOrders) * 100))
                  : 100;
              return (
                <div
                  key={slot.id}
                  className={`rounded-2xl border p-4 ${
                    slot.isClosed
                      ? 'border-red-200 bg-red-50/40'
                      : 'border-wheat bg-cream/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-serif text-base font-bold text-espresso">
                        {formatSlotWindow(slot.startTime, slot.endTime)}
                      </p>
                      <p className="text-xs text-cocoa">
                        Booked: <strong>{slot.bookedOrders}</strong> / {slot.maxOrders}
                        {slot.activeHolds > 0 && (
                          <span className="ml-1.5 text-terracotta">
                            (+{slot.activeHolds} in checkout)
                          </span>
                        )}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                        slot.isClosed
                          ? 'bg-red-100 text-red-700'
                          : 'bg-sage/15 text-sage'
                      }`}
                    >
                      {slot.isClosed ? 'Closed' : 'Open'}
                    </span>
                  </div>

                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-wheat">
                    <div
                      className={`h-full rounded-full transition-all ${
                        pct >= 90 ? 'bg-terracotta' : 'bg-sage'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-cocoa">Cap:</span>
                      <button
                        onClick={() =>
                          handleUpdateSlot(slot, {
                            maxOrders: Math.max(slot.bookedOrders, slot.maxOrders - 1),
                          })
                        }
                        className="rounded-lg border border-wheat bg-white p-1.5 hover:border-espresso"
                        title="Decrease max capacity"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="min-w-[26px] text-center text-xs font-bold text-espresso">
                        {slot.maxOrders}
                      </span>
                      <button
                        onClick={() =>
                          handleUpdateSlot(slot, { maxOrders: slot.maxOrders + 2 })
                        }
                        className="rounded-lg border border-wheat bg-white p-1.5 hover:border-espresso"
                        title="Increase max capacity by 2"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <button
                      onClick={() =>
                        handleUpdateSlot(slot, { isClosed: !slot.isClosed })
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-wheat bg-white px-3 py-1.5 text-xs font-semibold text-espresso hover:border-terracotta"
                    >
                      {slot.isClosed ? (
                        <>
                          <Unlock className="h-3.5 w-3.5 text-sage" />
                          Reopen
                        </>
                      ) : (
                        <>
                          <Lock className="h-3.5 w-3.5 text-red-600" />
                          Close Early
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* One-Click Menu Sold Out Panel */}
      <section className="rounded-2xl border border-wheat bg-white p-6 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-serif text-xl font-bold text-espresso">
              One-Click &ldquo;Sold Out&rdquo; Menu Controls
            </h2>
            <p className="text-xs text-cocoa">
              Immediately updates storefront availability and clears the Redis menu cache.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((prod) => (
            <div
              key={prod.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-wheat bg-cream/40 p-3.5"
            >
              <div className="min-w-0">
                <p className="truncate font-serif text-sm font-bold text-espresso">
                  {prod.name}
                </p>
                <p className="text-[11px] text-cocoa">
                  {formatMoney(prod.basePriceCents)} • {prod.leadTimeHours}h notice
                </p>
              </div>
              <button
                onClick={() => handleToggleProduct(prod)}
                className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                  prod.isActive
                    ? 'bg-sage/15 text-sage hover:bg-red-100 hover:text-red-700'
                    : 'bg-red-100 text-red-700 hover:bg-sage/15 hover:text-sage'
                }`}
              >
                {prod.isActive ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    In Stock
                  </>
                ) : (
                  <>
                    <Ban className="h-3.5 w-3.5" />
                    Sold Out
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
