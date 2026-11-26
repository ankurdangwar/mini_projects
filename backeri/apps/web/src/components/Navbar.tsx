'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChefHat,
  Clock,
  LogOut,
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { formatMoney } from '@backeri/shared';
import { useAuth } from './AuthProvider';
import { useCart } from './CartProvider';

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
  } = useCart();

  // Hide storefront navbar inside the Admin SPA shell
  if (pathname?.startsWith('/admin')) {
    return null;
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-wheat/80 bg-cream/95 backdrop-blur-md no-print">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-terracotta text-cream shadow-sm">
              <ChefHat className="h-5 w-5" />
            </div>
            <div>
              <span className="block font-serif text-xl font-bold tracking-tight text-espresso">
                Backeri
              </span>
              <span className="block text-[10px] uppercase tracking-[0.2em] text-cocoa">
                Artisan Bakehouse
              </span>
            </div>
          </Link>

          <nav className="hidden items-center gap-6 text-sm font-medium text-cocoa md:flex">
            <Link
              href="/"
              className={`transition hover:text-terracotta ${
                pathname === '/' ? 'text-espresso font-semibold' : ''
              }`}
            >
              Daily Menu
            </Link>
            <Link
              href="/orders"
              className={`transition hover:text-terracotta ${
                pathname?.startsWith('/orders') ? 'text-espresso font-semibold' : ''
              }`}
            >
              My Orders
            </Link>
            <Link
              href="/admin/board"
              className="rounded-full border border-wheat bg-parchment/70 px-3 py-1 text-xs font-semibold text-espresso transition hover:border-terracotta hover:text-terracotta"
            >
              Kitchen Dashboard
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            {user ? (
              <div className="hidden items-center gap-2 rounded-full border border-wheat bg-white px-3 py-1.5 text-xs text-cocoa sm:flex">
                <User className="h-3.5 w-3.5 text-terracotta" />
                <span className="max-w-[120px] truncate font-medium text-espresso">
                  {user.name.split(' ')[0]}
                </span>
                <button
                  onClick={() => logout()}
                  title="Sign out"
                  className="ml-1 text-cocoa/70 hover:text-terracotta"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <Link
                href="/checkout"
                className="hidden text-xs font-semibold text-cocoa hover:text-terracotta sm:inline-block"
              >
                Sign In
              </Link>
            )}

            <button
              onClick={() => setDrawerOpen(true)}
              className="relative flex items-center gap-2 rounded-full bg-espresso px-4 py-2 text-xs font-semibold text-cream shadow-sm transition hover:bg-terracotta"
            >
              <ShoppingBag className="h-4 w-4" />
              <span>Basket</span>
              {totalCount > 0 && (
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-terracotta px-1.5 text-[11px] font-bold text-white">
                  {totalCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Slide-over Cart Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-espresso/40 backdrop-blur-xs">
          <div className="flex h-full w-full max-w-md flex-col bg-cream shadow-2xl">
            <div className="flex items-center justify-between border-b border-wheat px-6 py-4">
              <div>
                <h2 className="font-serif text-lg font-bold text-espresso">
                  Your Bakery Basket
                </h2>
                <p className="text-xs text-cocoa">
                  {totalCount} {totalCount === 1 ? 'item' : 'items'}
                </p>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="rounded-full p-2 text-cocoa hover:bg-parchment"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {maxLeadTimeHours > 0 && (
              <div className="flex items-center gap-2 border-b border-wheat bg-parchment/70 px-6 py-2.5 text-xs text-cocoa">
                <Clock className="h-4 w-4 shrink-0 text-terracotta" />
                <span>
                  Earliest pickup/delivery requires{' '}
                  <strong className="text-espresso">
                    {maxLeadTimeHours}h kitchen notice
                  </strong>
                </span>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {items.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <ShoppingBag className="mb-3 h-10 w-10 text-wheat" />
                  <p className="font-serif text-base font-semibold text-espresso">
                    Your basket is empty
                  </p>
                  <p className="mt-1 text-xs text-cocoa">
                    Explore our warm sourdough loaves, croissants, and celebration cakes.
                  </p>
                </div>
              ) : (
                <ul className="space-y-4">
                  {items.map((item) => (
                    <li
                      key={item.key}
                      className="rounded-xl border border-wheat/80 bg-white p-3.5 shadow-xs"
                    >
                      <div className="flex gap-3">
                        <img
                          src={item.productImage}
                          alt={item.productName}
                          className="h-16 w-16 rounded-lg object-cover border border-wheat/60"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-serif text-sm font-bold text-espresso">
                              {item.productName}
                            </p>
                            <button
                              onClick={() => removeItem(item.key)}
                              className="text-cocoa/50 hover:text-red-600"
                              title="Remove item"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          <p className="text-xs text-cocoa">{item.variantLabel}</p>

                          {item.customNotes?.inscription && (
                            <p className="mt-1 rounded bg-parchment px-2 py-0.5 text-[11px] text-espresso">
                              Inscription: &ldquo;{item.customNotes.inscription}&rdquo;
                            </p>
                          )}
                          {item.customNotes?.referenceImageUrl && (
                            <p className="mt-1 text-[11px] text-sage font-medium">
                              Inspiration photo attached
                            </p>
                          )}

                          <div className="mt-2.5 flex items-center justify-between">
                            <div className="flex items-center gap-2 rounded-full border border-wheat px-2 py-0.5">
                              <button
                                onClick={() =>
                                  updateQuantity(item.key, item.quantity - 1)
                                }
                                className="text-cocoa hover:text-terracotta"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <span className="min-w-[18px] text-center text-xs font-semibold">
                                {item.quantity}
                              </span>
                              <button
                                onClick={() =>
                                  updateQuantity(item.key, item.quantity + 1)
                                }
                                className="text-cocoa hover:text-terracotta"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <span className="text-sm font-bold text-espresso">
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
              <div className="border-t border-wheat bg-white px-6 py-4">
                <div className="mb-3 flex items-center justify-between text-sm">
                  <span className="text-cocoa">Subtotal</span>
                  <span className="font-serif text-lg font-bold text-espresso">
                    {formatMoney(subtotalCents)}
                  </span>
                </div>
                <Link
                  href="/checkout"
                  onClick={() => setDrawerOpen(false)}
                  className="block w-full rounded-xl bg-terracotta py-3 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-terracotta-dark"
                >
                  Choose Pickup / Delivery Slot →
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
