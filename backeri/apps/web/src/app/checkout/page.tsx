'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Loader2,
  Lock,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Store,
  Truck,
} from 'lucide-react';
import { formatMoney, formatSlotWindow } from '@backeri/shared';
import { apiFetch } from '@/lib/api';
import type { OrderDTO, TimeSlotDTO } from '@/lib/types';
import { useAuth } from '@/components/AuthProvider';
import { useCart } from '@/components/CartProvider';

const DELIVERY_FEE_CENTS = 600;

function getUpcomingDates(count = 10): string[] {
  const dates: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + i)
    );
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { user, login, register } = useAuth();
  const { items, subtotalCents, maxLeadTimeHours, clearCart } = useCart();

  // Auth form state
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('customer@backeri.local');
  const [password, setPassword] = useState('password123');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  // Fulfillment & slot state
  const upcomingDates = useMemo(() => getUpcomingDates(10), []);
  const [selectedDate, setSelectedDate] = useState(() => {
    const defaultOffset = maxLeadTimeHours >= 24 ? 2 : 1;
    return upcomingDates[Math.min(defaultOffset, upcomingDates.length - 1)];
  });
  const [slots, setSlots] = useState<TimeSlotDTO[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<string>('');
  const [activeHold, setActiveHold] = useState<{
    slotId: string;
    holdId: string;
    expiresAt: string;
  } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  const [fulfillmentType, setFulfillmentType] = useState<'PICKUP' | 'DELIVERY'>(
    'PICKUP'
  );
  const [address, setAddress] = useState({
    line1: '',
    line2: '',
    city: 'San Francisco',
    postalCode: '',
    instructions: '',
  });

  // Checkout / Payment modal state
  const [checkoutError, setCheckoutError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey] = useState(() =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? `ord_${crypto.randomUUID()}`
      : `ord_${Date.now()}_${Math.random().toString(36).slice(2)}`
  );
  const [pendingPayment, setPendingPayment] = useState<{
    order: OrderDTO;
    providerRef: string;
    amountCents: number;
  } | null>(null);
  const [paying, setPaying] = useState(false);
  const [paymentFeedback, setPaymentFeedback] = useState('');

  // Load slots for selected date + lead time
  useEffect(() => {
    let active = true;
    setSlotsLoading(true);
    setCheckoutError('');

    apiFetch<{ slots: TimeSlotDTO[] }>(
      `/api/v1/slots?date=${selectedDate}&lead_time=${maxLeadTimeHours}`
    )
      .then((res) => {
        if (!active) return;
        setSlots(res.slots);
      })
      .catch((err) => {
        if (!active) return;
        setCheckoutError(err instanceof Error ? err.message : 'Failed to load slots');
      })
      .finally(() => {
        if (active) setSlotsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedDate, maxLeadTimeHours]);

  // Live countdown timer for Redis 10-minute soft-lock
  useEffect(() => {
    if (!activeHold) {
      setSecondsLeft(0);
      return;
    }

    const tick = () => {
      const diff = Math.max(
        0,
        Math.floor((new Date(activeHold.expiresAt).getTime() - Date.now()) / 1000)
      );
      setSecondsLeft(diff);
      if (diff === 0) {
        setActiveHold(null);
        setSelectedSlotId('');
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [activeHold]);

  const handleSelectSlot = async (slot: TimeSlotDTO) => {
    if (!slot.isAvailable && activeHold?.slotId !== slot.id) return;
    setCheckoutError('');

    try {
      // Release previous hold if switching slots
      if (activeHold && activeHold.slotId !== slot.id) {
        await apiFetch(
          `/api/v1/slots/${activeHold.slotId}/hold/${activeHold.holdId}`,
          { method: 'DELETE' }
        ).catch(() => {});
      }

      const res = await apiFetch<{
        hold: { slotId: string; holdId: string; expiresAt: string };
      }>(`/api/v1/slots/${slot.id}/hold`, {
        method: 'POST',
        body: JSON.stringify({
          holdId: activeHold?.slotId === slot.id ? activeHold.holdId : undefined,
        }),
      });

      setSelectedSlotId(slot.id);
      setActiveHold(res.hold);
    } catch (err) {
      setCheckoutError(
        err instanceof Error ? err.message : 'Could not reserve this slot'
      );
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthBusy(true);
    try {
      if (authMode === 'login') {
        await login(email, password);
      } else {
        await register({ email, password, name, phone: phone || undefined });
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setAuthBusy(false);
    }
  };

  const handlePlaceOrder = async () => {
    setCheckoutError('');
    if (!user) {
      setCheckoutError('Please sign in to place your order.');
      return;
    }
    if (!selectedSlotId) {
      setCheckoutError('Please select a pickup or delivery time slot first.');
      return;
    }
    if (
      fulfillmentType === 'DELIVERY' &&
      (!address.line1.trim() || !address.city.trim() || !address.postalCode.trim())
    ) {
      setCheckoutError('Please enter your delivery street address, city, and postal code.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch<{
        order: OrderDTO;
        paymentIntent: { providerRef: string; amountCents: number };
      }>('/api/v1/orders', {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          slotId: selectedSlotId,
          holdId: activeHold?.holdId,
          fulfillmentType,
          deliveryAddress:
            fulfillmentType === 'DELIVERY'
              ? {
                  line1: address.line1.trim(),
                  line2: address.line2.trim() || undefined,
                  city: address.city.trim(),
                  postalCode: address.postalCode.trim(),
                  instructions: address.instructions.trim() || undefined,
                }
              : undefined,
          idempotencyKey,
          items: items.map((i) => ({
            variantId: i.variantId,
            quantity: i.quantity,
            customNotes: i.customNotes,
          })),
        }),
      });

      setPendingPayment({
        order: res.order,
        providerRef: res.paymentIntent.providerRef,
        amountCents: res.paymentIntent.amountCents,
      });
    } catch (err) {
      setCheckoutError(
        err instanceof Error ? err.message : 'Could not create order'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSimulatePayment = async (
    mode: 'SUCCEEDED' | 'FAILED' | 'DUPLICATE'
  ) => {
    if (!pendingPayment) return;
    setPaying(true);
    setPaymentFeedback('');
    try {
      const res = await apiFetch<Record<string, unknown>>(
        `/api/v1/sandbox/payments/${pendingPayment.providerRef}/simulate`,
        {
          method: 'POST',
          body: JSON.stringify({ mode }),
        }
      );

      if (mode === 'FAILED') {
        setPaymentFeedback(
          'Payment declined (simulated). Order marked CANCELLED and slot lock released.'
        );
        setActiveHold(null);
        return;
      }

      if (mode === 'DUPLICATE') {
        const second = res.second as { idempotent?: boolean } | undefined;
        setPaymentFeedback(
          `Duplicate webhook verified! 2nd delivery returned idempotent=${String(
            second?.idempotent
          )} — slot booked exactly once.`
        );
      }

      clearCart();
      setActiveHold(null);
      setTimeout(() => {
        router.push(`/orders/${pendingPayment.order.id}`);
      }, mode === 'DUPLICATE' ? 1400 : 300);
    } catch (err) {
      setPaymentFeedback(
        err instanceof Error ? err.message : 'Payment webhook failed'
      );
    } finally {
      setPaying(false);
    }
  };

  const deliveryFeeCents =
    fulfillmentType === 'DELIVERY' ? DELIVERY_FEE_CENTS : 0;
  const totalCents = subtotalCents + deliveryFeeCents;

  const formatCountdown = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  if (items.length === 0 && !pendingPayment) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="font-serif text-3xl font-bold text-espresso">
          Your bakery basket is empty
        </h1>
        <p className="mt-2 text-sm text-cocoa">
          Add fresh bread, pastries, or a custom celebration cake before selecting a
          pickup window.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-full bg-terracotta px-6 py-3 text-sm font-semibold text-white hover:bg-terracotta-dark"
        >
          Browse Daily Menu
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="font-serif text-3xl font-bold text-espresso">
        Checkout &amp; Kitchen Slot Reservation
      </h1>
      <p className="mt-1 text-sm text-cocoa">
        Choose your fulfillment window. Selecting a slot locks your oven spot in Redis for
        10 minutes while you complete payment.
      </p>

      {/* Active 10-minute soft-lock banner */}
      {activeHold && secondsLeft > 0 && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sage/40 bg-sage/10 px-5 py-3 text-xs text-espresso">
          <div className="flex items-center gap-2 font-semibold">
            <Lock className="h-4 w-4 text-sage" />
            <span>
              Kitchen slot softly reserved for you — protected from overbooking!
            </span>
          </div>
          <span className="rounded-full bg-sage px-3 py-1 font-mono text-xs font-bold text-white">
            Hold expires in {formatCountdown(secondsLeft)}
          </span>
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-7">
          {/* Step 1: Account */}
          <section className="rounded-2xl border border-wheat bg-white p-6 shadow-xs">
            <h2 className="font-serif text-lg font-bold text-espresso">
              1. Customer Account
            </h2>

            {user ? (
              <div className="mt-3 flex items-center justify-between rounded-xl bg-parchment/70 px-4 py-3 text-sm">
                <div>
                  <p className="font-semibold text-espresso">{user.name}</p>
                  <p className="text-xs text-cocoa">
                    {user.email} {user.phone ? `• ${user.phone}` : ''}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-sage/15 px-2.5 py-1 text-xs font-semibold text-sage">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Signed in
                </span>
              </div>
            ) : (
              <form onSubmit={handleAuthSubmit} className="mt-4 space-y-3">
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setAuthMode('login')}
                    className={`rounded-full px-3.5 py-1 font-semibold ${
                      authMode === 'login'
                        ? 'bg-espresso text-cream'
                        : 'bg-parchment text-cocoa'
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthMode('register')}
                    className={`rounded-full px-3.5 py-1 font-semibold ${
                      authMode === 'register'
                        ? 'bg-espresso text-cream'
                        : 'bg-parchment text-cocoa'
                    }`}
                  >
                    Create Account
                  </button>
                </div>

                {authMode === 'register' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      type="text"
                      required
                      placeholder="Full Name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="rounded-xl border border-wheat bg-cream/60 px-3.5 py-2.5 text-sm"
                    />
                    <input
                      type="tel"
                      placeholder="Mobile Phone (for Ready SMS)"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="rounded-xl border border-wheat bg-cream/60 px-3.5 py-2.5 text-sm"
                    />
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    type="email"
                    required
                    placeholder="Email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="rounded-xl border border-wheat bg-cream/60 px-3.5 py-2.5 text-sm"
                  />
                  <input
                    type="password"
                    required
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="rounded-xl border border-wheat bg-cream/60 px-3.5 py-2.5 text-sm"
                  />
                </div>

                {authError && (
                  <p className="text-xs font-medium text-red-600">{authError}</p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="submit"
                    disabled={authBusy}
                    className="rounded-xl bg-espresso px-5 py-2.5 text-xs font-semibold text-cream hover:bg-terracotta disabled:opacity-60"
                  >
                    {authBusy
                      ? 'Please wait...'
                      : authMode === 'login'
                        ? 'Sign In & Continue'
                        : 'Register & Continue'}
                  </button>
                  <span className="text-[11px] text-cocoa">
                    Demo customer pre-filled: <code>customer@backeri.local</code> /{' '}
                    <code>password123</code>
                  </span>
                </div>
              </form>
            )}
          </section>

          {/* Step 2: Fulfillment */}
          <section className="rounded-2xl border border-wheat bg-white p-6 shadow-xs">
            <h2 className="font-serif text-lg font-bold text-espresso">
              2. Pickup or Local Delivery
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setFulfillmentType('PICKUP')}
                className={`flex items-center gap-3 rounded-xl border p-4 text-left transition ${
                  fulfillmentType === 'PICKUP'
                    ? 'border-terracotta bg-terracotta/5 ring-1 ring-terracotta'
                    : 'border-wheat hover:border-espresso/40'
                }`}
              >
                <Store className="h-5 w-5 text-terracotta" />
                <div>
                  <p className="text-sm font-bold text-espresso">Bakery Pickup</p>
                  <p className="text-xs text-cocoa">Free • Warm from the counter</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFulfillmentType('DELIVERY')}
                className={`flex items-center gap-3 rounded-xl border p-4 text-left transition ${
                  fulfillmentType === 'DELIVERY'
                    ? 'border-terracotta bg-terracotta/5 ring-1 ring-terracotta'
                    : 'border-wheat hover:border-espresso/40'
                }`}
              >
                <Truck className="h-5 w-5 text-terracotta" />
                <div>
                  <p className="text-sm font-bold text-espresso">Local Courier</p>
                  <p className="text-xs text-cocoa">
                    {formatMoney(DELIVERY_FEE_CENTS)} flat fee
                  </p>
                </div>
              </button>
            </div>

            {fulfillmentType === 'DELIVERY' && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <input
                  type="text"
                  placeholder="Street Address *"
                  value={address.line1}
                  onChange={(e) =>
                    setAddress({ ...address, line1: e.target.value })
                  }
                  className="sm:col-span-2 rounded-xl border border-wheat bg-cream/60 px-3.5 py-2.5 text-sm"
                />
                <input
                  type="text"
                  placeholder="City *"
                  value={address.city}
                  onChange={(e) =>
                    setAddress({ ...address, city: e.target.value })
                  }
                  className="rounded-xl border border-wheat bg-cream/60 px-3.5 py-2.5 text-sm"
                />
                <input
                  type="text"
                  placeholder="Postal Code *"
                  value={address.postalCode}
                  onChange={(e) =>
                    setAddress({ ...address, postalCode: e.target.value })
                  }
                  className="rounded-xl border border-wheat bg-cream/60 px-3.5 py-2.5 text-sm"
                />
                <input
                  type="text"
                  placeholder="Gate code / Delivery instructions (optional)"
                  value={address.instructions}
                  onChange={(e) =>
                    setAddress({ ...address, instructions: e.target.value })
                  }
                  className="sm:col-span-2 rounded-xl border border-wheat bg-cream/60 px-3.5 py-2.5 text-sm"
                />
              </div>
            )}
          </section>

          {/* Step 3: Time Slot Picker */}
          <section className="rounded-2xl border border-wheat bg-white p-6 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-serif text-lg font-bold text-espresso">
                3. Select Pickup / Delivery Window
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-parchment px-3 py-1 text-xs font-semibold text-cocoa">
                <Clock className="h-3.5 w-3.5 text-terracotta" />
                Cart requires {maxLeadTimeHours}h notice
              </span>
            </div>

            <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
              {upcomingDates.map((d) => {
                const label = new Date(`${d}T12:00:00Z`).toLocaleDateString(
                  'en-US',
                  { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }
                );
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setSelectedDate(d)}
                    className={`shrink-0 rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
                      selectedDate === d
                        ? 'border-espresso bg-espresso text-cream'
                        : 'border-wheat bg-cream/60 text-cocoa hover:border-terracotta'
                    }`}
                  >
                    <Calendar className="mx-auto mb-1 h-3.5 w-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="mt-4">
              {slotsLoading ? (
                <div className="flex items-center justify-center py-8 text-xs text-cocoa">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin text-terracotta" />
                  Checking live kitchen capacity...
                </div>
              ) : slots.length === 0 ? (
                <div className="rounded-xl border border-wheat bg-parchment/60 p-5 text-center text-xs text-cocoa">
                  No eligible slots remain on <strong>{selectedDate}</strong> for items
                  requiring <strong>{maxLeadTimeHours}h notice</strong>. Try picking a
                  later date above.
                </div>
              ) : (
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {slots.map((slot) => {
                    const isSelected = selectedSlotId === slot.id;
                    const disabled = !slot.isAvailable && !isSelected;
                    return (
                      <button
                        key={slot.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => handleSelectSlot(slot)}
                        className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
                          isSelected
                            ? 'border-terracotta bg-terracotta/10 ring-1 ring-terracotta'
                            : disabled
                              ? 'cursor-not-allowed border-wheat/60 bg-parchment/50 opacity-50'
                              : 'border-wheat bg-cream/40 hover:border-terracotta'
                        }`}
                      >
                        <div>
                          <p className="text-sm font-bold text-espresso">
                            {formatSlotWindow(slot.startTime, slot.endTime)}
                          </p>
                          <p className="text-[11px] text-cocoa">
                            {isSelected
                              ? 'Held for you (10m)'
                              : slot.remainingSpots > 0
                                ? `${slot.remainingSpots} of ${slot.maxOrders} spots open`
                                : 'Fully booked'}
                          </p>
                        </div>
                        {isSelected && (
                          <CheckCircle2 className="h-5 w-5 text-terracotta" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Order Summary Column */}
        <aside className="lg:col-span-5">
          <div className="sticky top-24 rounded-2xl border border-wheat bg-white p-6 shadow-sm">
            <h2 className="font-serif text-lg font-bold text-espresso">
              Order Summary
            </h2>

            <ul className="mt-4 divide-y divide-wheat/60">
              {items.map((item) => (
                <li key={item.key} className="flex justify-between gap-3 py-3 text-sm">
                  <div>
                    <p className="font-semibold text-espresso">
                      {item.quantity}× {item.productName}
                    </p>
                    <p className="text-xs text-cocoa">{item.variantLabel}</p>
                    {item.customNotes?.inscription && (
                      <p className="mt-0.5 text-[11px] italic text-terracotta">
                        &ldquo;{item.customNotes.inscription}&rdquo;
                      </p>
                    )}
                  </div>
                  <span className="font-semibold text-espresso">
                    {formatMoney(item.unitPriceCents * item.quantity)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-4 space-y-2 border-t border-wheat pt-4 text-sm">
              <div className="flex justify-between text-cocoa">
                <span>Subtotal</span>
                <span>{formatMoney(subtotalCents)}</span>
              </div>
              <div className="flex justify-between text-cocoa">
                <span>Fulfillment ({fulfillmentType})</span>
                <span>
                  {deliveryFeeCents > 0 ? formatMoney(deliveryFeeCents) : 'Free'}
                </span>
              </div>
              <div className="flex justify-between border-t border-wheat pt-3 font-serif text-xl font-bold text-espresso">
                <span>Total</span>
                <span>{formatMoney(totalCents)}</span>
              </div>
            </div>

            {checkoutError && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{checkoutError}</span>
              </div>
            )}

            <button
              type="button"
              disabled={submitting || !user || !selectedSlotId}
              onClick={handlePlaceOrder}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-terracotta py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-terracotta-dark disabled:cursor-not-allowed disabled:bg-wheat disabled:text-cocoa"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4" />
              )}
              <span>
                {submitting
                  ? 'Creating Order...'
                  : `Continue to Payment • ${formatMoney(totalCents)}`}
              </span>
            </button>

            <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-cocoa">
              <ShieldCheck className="h-3.5 w-3.5 text-sage" />
              Idempotent checkout • Slot finalized via signed payment webhook
            </p>
          </div>
        </aside>
      </div>

      {/* Built-in Sandbox Payment Gateway Modal */}
      {pendingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-espresso/55 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl border border-wheat bg-cream p-6 shadow-2xl">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-terracotta">
              <CreditCard className="h-4 w-4" />
              Sandbox Payment Gateway (Stripe / Razorpay Mode)
            </div>
            <h3 className="mt-2 font-serif text-2xl font-bold text-espresso">
              Confirm {formatMoney(pendingPayment.amountCents)}
            </h3>
            <p className="mt-1 text-xs text-cocoa">
              Order <strong>{pendingPayment.order.orderNumber}</strong> is currently{' '}
              <code>PENDING</code>. Payment confirmation executes an HMAC-signed webhook
              with PostgreSQL <code>SELECT ... FOR UPDATE</code> slot locking and pushes
              the order live to the kitchen board.
            </p>

            <div className="mt-4 rounded-xl border border-wheat bg-white p-3 text-xs text-cocoa">
              <div className="flex justify-between">
                <span>Payment Intent</span>
                <code className="font-mono text-espresso">
                  {pendingPayment.providerRef}
                </code>
              </div>
              <div className="mt-1 flex justify-between">
                <span>Fulfillment</span>
                <span className="font-semibold text-espresso">
                  {pendingPayment.order.fulfillmentType}
                </span>
              </div>
            </div>

            {paymentFeedback && (
              <div className="mt-3 rounded-xl border border-sage/40 bg-sage/10 p-3 text-xs font-medium text-espresso">
                {paymentFeedback}
              </div>
            )}

            <div className="mt-5 space-y-2.5">
              <button
                type="button"
                disabled={paying}
                onClick={() => handleSimulatePayment('SUCCEEDED')}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-sage py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              >
                {paying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Pay Now (Confirm via Signed Webhook)
              </button>

              <button
                type="button"
                disabled={paying}
                onClick={() => handleSimulatePayment('DUPLICATE')}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-espresso/25 bg-white py-2.5 text-xs font-semibold text-espresso hover:bg-parchment disabled:opacity-60"
              >
                <RefreshCw className="h-3.5 w-3.5 text-terracotta" />
                Pay &amp; Test Duplicate Webhook Replay (Idempotency)
              </button>

              <button
                type="button"
                disabled={paying}
                onClick={() => handleSimulatePayment('FAILED')}
                className="w-full rounded-xl border border-red-200 bg-red-50 py-2.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
              >
                Simulate Declined Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
