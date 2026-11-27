'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  LogOut,
  MapPin,
  Minus,
  Plus,
  ShoppingBag,
  Store,
  Trash2,
  Truck,
  User,
  X,
  Zap,
} from 'lucide-react';
import { formatMoney } from '@backeri/shared';
import { useAuth } from './AuthProvider';
import { useCart } from './CartProvider';

const QUICK_PINCODES = [
  { code: '560038', label: 'Indiranagar' },
  { code: '560034', label: 'Koramangala' },
  { code: '560001', label: 'MG Road' },
  { code: '400050', label: 'Bandra West' },
];

export function Navbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const {
    items,
    drawerOpen,
    setDrawerOpen,
    updateQuantity,
    removeItem,
    totalCount,
    subtotalCents,
    maxLeadTimeHours,
    fulfillmentMode,
    setFulfillmentMode,
    deliveryZone,
    setPincode,
    earliestSlotLabel,
  } = useCart();

  const [pinOpen, setPinOpen] = useState(false);
  const [pinInput, setPinInput] = useState(deliveryZone.pincode);

  // Hide storefront header inside Admin SPA
  if (pathname?.startsWith('/admin')) {
    return null;
  }

  const handleApplyPincode = (e: React.FormEvent) => {
    e.preventDefault();
    const res = setPincode(pinInput);
    if (res.eligible) {
      setFulfillmentMode('DELIVERY');
    }
    setPinOpen(false);
  };

  return (
    <>
      {/* Persistent Delivery / Pickup Bar + Main Header */}
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] no-print">
        {/* Top Utility Strip: Locks in Delivery/Pickup, Pincode & Earliest Slot */}
        <div className="border-b border-stone-100 bg-surface/90">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-6">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {/* Delivery / Pickup Toggle */}
              <div className="inline-flex rounded-lg border border-stone-200 bg-white p-0.5 text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setFulfillmentMode('DELIVERY')}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 transition ${
                    fulfillmentMode === 'DELIVERY'
                      ? 'bg-coral text-white shadow-2xs'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  <Truck className="h-3 w-3" />
                  Delivery
                </button>
                <button
                  type="button"
                  onClick={() => setFulfillmentMode('PICKUP')}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 transition ${
                    fulfillmentMode === 'PICKUP'
                      ? 'bg-ink text-white shadow-2xs'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  <Store className="h-3 w-3" />
                  Pickup
                </button>
              </div>

              {/* Pincode / Store Location Selector */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setPinInput(deliveryZone.pincode);
                    setPinOpen((o) => !o);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-ink transition hover:border-coral"
                >
                  <MapPin className="h-3.5 w-3.5 text-coral" />
                  {fulfillmentMode === 'DELIVERY' ? (
                    <>
                      <span className="font-semibold">{deliveryZone.pincode}</span>
                      <span className="hidden text-muted sm:inline">
                        • {deliveryZone.area}
                      </span>
                      {deliveryZone.eligible && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-fresh" />
                      )}
                    </>
                  ) : (
                    <span>Backeri Flagship • 100ft Rd</span>
                  )}
                  <ChevronDown className="h-3.5 w-3.5 text-muted" />
                </button>

                {pinOpen && (
                  <div className="absolute left-0 top-10 z-50 w-72 rounded-xl border border-stone-200 bg-white p-4 shadow-xl">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-ink">
                        Check Delivery Pincode
                      </p>
                      <button
                        type="button"
                        onClick={() => setPinOpen(false)}
                        className="text-muted hover:text-ink"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <form onSubmit={handleApplyPincode} className="mt-2.5 flex gap-1.5">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={pinInput}
                        onChange={(e) =>
                          setPinInput(e.target.value.replace(/\D/g, ''))
                        }
                        placeholder="e.g. 560038"
                        className="w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs font-semibold text-ink focus:border-coral focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="rounded-lg bg-coral px-3 py-1.5 text-xs font-bold text-white hover:bg-coral-dark"
                      >
                        Check
                      </button>
                    </form>

                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {QUICK_PINCODES.map((p) => (
                        <button
                          key={p.code}
                          type="button"
                          onClick={() => {
                            setPincode(p.code);
                            setPinInput(p.code);
                            setFulfillmentMode('DELIVERY');
                            setPinOpen(false);
                          }}
                          className="rounded-md border border-stone-200 bg-surface px-2 py-1 text-[11px] font-medium text-ink hover:border-fresh hover:text-fresh"
                        >
                          {p.code} • {p.label}
                        </button>
                      ))}
                    </div>

                    <p
                      className={`mt-2.5 text-[11px] font-semibold ${
                        deliveryZone.eligible ? 'text-fresh' : 'text-coral'
                      }`}
                    >
                      {deliveryZone.eligible
                        ? `✓ Express delivery eligible (${deliveryZone.etaLabel})`
                        : 'Enter a valid 6-digit pincode or switch to Pickup'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Live Earliest Slot Guarantee */}
            <div className="inline-flex items-center gap-1.5 rounded-full bg-fresh/10 px-2.5 py-1 text-[11px] font-bold text-fresh">
              <Zap className="h-3 w-3 fill-fresh text-fresh" />
              <span>Earliest: {earliestSlotLabel}</span>
            </div>
          </div>
        </div>

        {/* Main Compact Navigation Bar */}
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-3 py-2.5 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-coral text-sm font-black tracking-tight text-white shadow-xs">
              B
            </div>
            <div className="leading-none">
              <span className="block text-base font-extrabold tracking-tight text-ink">
                backeri
              </span>
              <span className="block text-[10px] font-semibold text-muted">
                Express Bakehouse &amp; Cafe
              </span>
            </div>
          </Link>

          <nav className="hidden items-center gap-5 text-xs font-semibold text-muted md:flex">
            <Link
              href="/"
              className={`transition hover:text-coral ${
                pathname === '/' ? 'text-ink' : ''
              }`}
            >
              Order Now
            </Link>
            <Link
              href="/orders"
              className={`transition hover:text-coral ${
                pathname?.startsWith('/orders') ? 'text-ink' : ''
              }`}
            >
              My Orders
            </Link>
            <Link
              href="/admin/board"
              className="rounded-md border border-stone-200 bg-surface px-2.5 py-1 text-[11px] font-semibold text-ink transition hover:border-ink"
            >
              Kitchen Ops
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            {user ? (
              <div className="hidden items-center gap-1.5 rounded-lg border border-stone-200 bg-surface px-2.5 py-1.5 text-xs sm:flex">
                <User className="h-3.5 w-3.5 text-coral" />
                <span className="max-w-[96px] truncate font-semibold text-ink">
                  {user.name.split(' ')[0]}
                </span>
                <button
                  onClick={() => logout()}
                  title="Sign out"
                  className="ml-0.5 text-muted hover:text-coral"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <Link
                href="/checkout"
                className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-ink hover:border-ink"
              >
                Sign In
              </Link>
            )}

            <button
              onClick={() => setDrawerOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-coral px-3.5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-coral-dark"
            >
              <ShoppingBag className="h-4 w-4" />
              <span className="hidden sm:inline">
                {totalCount > 0 ? formatMoney(subtotalCents) : 'Cart'}
              </span>
              {totalCount > 0 && (
                <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-white px-1 text-[10px] font-extrabold text-coral">
                  {totalCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile-First Sticky Floating Checkout Bar (visible when items > 0 on storefront) */}
      {totalCount > 0 && pathname === '/' && !drawerOpen && (
        <div className="fixed bottom-3 left-3 right-3 z-30 mx-auto max-w-xl sm:bottom-5 no-print">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-ink px-4 py-3 text-white shadow-2xl ring-1 ring-black/10">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="text-left"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-300">
                {totalCount} {totalCount === 1 ? 'item' : 'items'} •{' '}
                {fulfillmentMode === 'DELIVERY' ? deliveryZone.pincode : 'Pickup'}
              </p>
              <p className="text-base font-extrabold leading-tight">
                {formatMoney(subtotalCents)}
              </p>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
              >
                View Cart
              </button>
              <Link
                href="/checkout"
                className="inline-flex items-center gap-1 rounded-lg bg-coral px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-coral-dark"
              >
                Checkout
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Slide-Over Quick Cart Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-[2px]">
          <div className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
              <div>
                <h2 className="text-base font-extrabold text-ink">
                  Your Order ({totalCount})
                </h2>
                <p className="text-xs font-medium text-fresh">
                  {fulfillmentMode === 'DELIVERY'
                    ? `Delivering to ${deliveryZone.pincode} (${deliveryZone.area})`
                    : 'Self-Pickup at Backeri Flagship'}
                </p>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="rounded-lg p-1.5 text-muted hover:bg-surface"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex items-center justify-between border-b border-stone-100 bg-surface px-5 py-2.5 text-xs">
              <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
                <Clock className="h-3.5 w-3.5 text-coral" />
                Earliest: {earliestSlotLabel}
              </span>
              {maxLeadTimeHours > 0 && (
                <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                  {maxLeadTimeHours}h bake notice
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {items.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <ShoppingBag className="mb-3 h-10 w-10 text-stone-300" />
                  <p className="text-sm font-bold text-ink">Your cart is empty</p>
                  <p className="mt-1 text-xs text-muted">
                    Add fresh pastries, sourdough, or a custom eggless cake in one tap.
                  </p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {items.map((item) => (
                    <li
                      key={item.key}
                      className="rounded-xl border border-stone-200 bg-white p-3"
                    >
                      <div className="flex gap-3">
                        <img
                          src={item.productImage}
                          alt={item.productName}
                          className="h-14 w-14 rounded-lg border border-stone-200 object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-bold text-ink leading-snug">
                              {item.productName}
                            </p>
                            <button
                              onClick={() => removeItem(item.key)}
                              className="text-stone-400 hover:text-coral"
                              title="Remove item"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          <p className="text-[11px] font-medium text-muted">
                            {item.variantLabel}
                          </p>

                          {item.customNotes?.inscription && (
                            <p className="mt-1 rounded bg-surface px-2 py-0.5 text-[11px] font-medium text-ink">
                              Message: &ldquo;{item.customNotes.inscription}&rdquo;
                            </p>
                          )}

                          <div className="mt-2.5 flex items-center justify-between">
                            <div className="inline-flex items-center rounded-lg border border-coral/30 bg-coral/5">
                              <button
                                onClick={() =>
                                  updateQuantity(item.key, item.quantity - 1)
                                }
                                className="px-2 py-1 text-coral hover:bg-coral/10"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <span className="min-w-[24px] text-center text-xs font-extrabold text-coral">
                                {item.quantity}
                              </span>
                              <button
                                onClick={() =>
                                  updateQuantity(item.key, item.quantity + 1)
                                }
                                className="px-2 py-1 text-coral hover:bg-coral/10"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <span className="text-sm font-extrabold text-ink">
                              {formatMoney(item.unitPriceCents * item.quantity)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {items.length > 0 && (
              <div className="border-t border-stone-200 bg-white px-5 py-4">
                <div className="mb-3 flex items-center justify-between text-sm">
                  <span className="font-medium text-muted">Item Total</span>
                  <span className="text-lg font-extrabold text-ink">
                    {formatMoney(subtotalCents)}
                  </span>
                </div>
                <Link
                  href="/checkout"
                  onClick={() => setDrawerOpen(false)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-coral py-3 text-sm font-bold text-white shadow-sm transition hover:bg-coral-dark"
                >
                  Proceed to Slot &amp; Pay
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
