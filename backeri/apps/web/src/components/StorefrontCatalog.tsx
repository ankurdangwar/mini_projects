'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Minus,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { formatMoney } from '@backeri/shared';
import type { ProductDTO } from '@/lib/types';
import { useCart } from './CartProvider';
import { QuickCustomizeSheet } from './QuickCustomizeSheet';

const CATEGORY_ORDER = ['Cakes', 'Pastries', 'Breads', 'Savories', 'Combos'];

interface PromoSlide {
  id: string;
  badge: string;
  headline: string;
  subtext: string;
  cta: string;
  bgClass: string;
  action: 'cakes' | 'ready30' | 'eggless';
}

const PROMO_SLIDES: PromoSlide[] = [
  {
    id: 'same-day-cakes',
    badge: 'EXPRESS CELEBRATION',
    headline: 'Same-Day Custom Cakes — Order Before 2 PM',
    subtext: '500g, 1kg & 2kg Belgian Truffle & Pistachio cakes with free message plaque.',
    cta: 'Shop Cakes',
    bgClass: 'bg-gradient-to-r from-coral to-[#C81D2B]',
    action: 'cakes',
  },
  {
    id: 'ready-30-mins',
    badge: 'WARM FROM THE OVEN',
    headline: 'Fresh Croissants, Sourdough & Combos in 30 Mins',
    subtext: 'Zero wait time — baked in morning batches for instant doorstep delivery.',
    cta: 'Show Ready Now',
    bgClass: 'bg-gradient-to-r from-fresh to-[#1F7A70]',
    action: 'ready30',
  },
  {
    id: 'eggless-range',
    badge: '100% EGGLESS RANGE',
    headline: 'Zero-Compromise Eggless & Sugar-Free Bakes',
    subtext: 'Every celebration cake & cafe pastry crafted with pure vegetarian ingredients.',
    cta: 'Filter Eggless',
    bgClass: 'bg-gradient-to-r from-ink to-[#3A3532]',
    action: 'eggless',
  },
];

interface SmartFilters {
  eggless: boolean;
  sugarFree: boolean;
  under500: boolean;
  readyIn30: boolean;
}

function isProductEggless(p: ProductDTO): boolean {
  return (
    p.tags.some((t) => /eggless|vegan/i.test(t)) ||
    p.variants.some((v) => /eggless/i.test(v.label))
  );
}

function isProductSugarFree(p: ProductDTO): boolean {
  return (
    p.tags.some((t) => /sugar-free|zero-sugar/i.test(t)) ||
    /sugar-free|zero-sugar/i.test(p.name) ||
    p.variants.some((v) => /sugar-free/i.test(v.label))
  );
}

function isReadyIn30(p: ProductDTO): boolean {
  return (
    p.leadTimeHours <= 1 ||
    p.tags.some((t) => /30\s*min/i.test(t))
  );
}

export function StorefrontCatalog({
  categories,
  products,
}: {
  categories: string[];
  products: ProductDTO[];
}) {
  const { addItem, updateQuantity, getDefaultVariantItem, getProductQuantity } =
    useCart();

  const orderedCategories = useMemo(() => {
    const known = CATEGORY_ORDER.filter((c) => categories.includes(c));
    const extras = categories.filter((c) => !CATEGORY_ORDER.includes(c));
    return [...known, ...extras];
  }, [categories]);

  const [promoIdx, setPromoIdx] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<SmartFilters>({
    eggless: false,
    sugarFree: false,
    under500: false,
    readyIn30: false,
  });
  const [customizingProduct, setCustomizingProduct] =
    useState<ProductDTO | null>(null);

  // Auto-advance promotional carousel every 5.5s
  useEffect(() => {
    const timer = setInterval(() => {
      setPromoIdx((idx) => (idx + 1) % PROMO_SLIDES.length);
    }, 5500);
    return () => clearInterval(timer);
  }, []);

  const handlePromoAction = (action: PromoSlide['action']) => {
    if (action === 'cakes') {
      setSelectedCategory('Cakes');
      setFilters({ eggless: false, sugarFree: false, under500: false, readyIn30: false });
    } else if (action === 'ready30') {
      setSelectedCategory('All');
      setFilters({ eggless: false, sugarFree: false, under500: false, readyIn30: true });
    } else if (action === 'eggless') {
      setSelectedCategory('All');
      setFilters({ eggless: true, sugarFree: false, under500: false, readyIn30: false });
    }
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const visibleProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (selectedCategory !== 'All' && p.category !== selectedCategory) {
        return false;
      }
      if (filters.eggless && !isProductEggless(p)) return false;
      if (filters.sugarFree && !isProductSugarFree(p)) return false;
      if (filters.under500 && p.basePriceCents > 50000) return false;
      if (filters.readyIn30 && !isReadyIn30(p)) return false;
      if (q) {
        const hit =
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q));
        if (!hit) return false;
      }
      return true;
    });
  }, [products, selectedCategory, filters, search]);

  const handlePrimaryAdd = (product: ProductDTO) => {
    if (!product.isActive) return;

    const isCake = product.category.toLowerCase().includes('cake');
    if (isCake) {
      setCustomizingProduct(product);
      return;
    }

    const defaultVariant = product.variants[0];
    if (!defaultVariant) return;

    addItem(
      {
        productId: product.id,
        productName: product.name,
        productImage: product.imageUrl,
        leadTimeHours: product.leadTimeHours,
        variantId: defaultVariant.id,
        variantLabel: defaultVariant.label,
        unitPriceCents: product.basePriceCents + defaultVariant.priceDeltaCents,
        quantity: 1,
      },
      { openDrawer: false }
    );
  };

  const currentPromo = PROMO_SLIDES[promoIdx];

  return (
    <div className="pb-24">
      {/* 1. Compact Promotional Carousel Banner */}
      <section className="mx-auto max-w-6xl px-3 pt-3 sm:px-6 sm:pt-4">
        <div
          className={`relative overflow-hidden rounded-2xl ${currentPromo.bgClass} px-5 py-4 text-white shadow-sm transition-colors duration-300 sm:px-7 sm:py-5`}
        >
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest backdrop-blur-xs">
                <Zap className="h-3 w-3 fill-white" />
                {currentPromo.badge}
              </span>
              <h1 className="mt-1.5 text-lg font-extrabold tracking-tight sm:text-2xl">
                {currentPromo.headline}
              </h1>
              <p className="mt-0.5 text-xs text-white/90 sm:text-sm">
                {currentPromo.subtext}
              </p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center">
              <button
                type="button"
                onClick={() => handlePromoAction(currentPromo.action)}
                className="shrink-0 rounded-xl bg-white px-4 py-2 text-xs font-extrabold text-ink shadow-xs transition hover:bg-stone-100"
              >
                {currentPromo.cta} →
              </button>
              <div className="hidden items-center gap-1 sm:flex">
                <button
                  type="button"
                  aria-label="Previous offer"
                  onClick={() =>
                    setPromoIdx(
                      (i) => (i - 1 + PROMO_SLIDES.length) % PROMO_SLIDES.length
                    )
                  }
                  className="rounded-lg bg-white/15 p-1.5 hover:bg-white/25"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Next offer"
                  onClick={() =>
                    setPromoIdx((i) => (i + 1) % PROMO_SLIDES.length)
                  }
                  className="rounded-lg bg-white/15 p-1.5 hover:bg-white/25"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Carousel Dots */}
          <div className="mt-3 flex items-center gap-1.5">
            {PROMO_SLIDES.map((slide, idx) => (
              <button
                key={slide.id}
                type="button"
                aria-label={`Slide ${idx + 1}`}
                onClick={() => setPromoIdx(idx)}
                className={`h-1.5 rounded-full transition-all ${
                  idx === promoIdx ? 'w-6 bg-white' : 'w-1.5 bg-white/40'
                }`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* 2. Sticky Horizontal Category Bar + Smart Filter Pills */}
      <div className="sticky top-[92px] z-20 mt-3 border-y border-stone-200 bg-white/95 backdrop-blur-md sm:top-[96px]">
        <div className="mx-auto max-w-6xl px-3 sm:px-6">
          {/* Horizontal Category Tabs */}
          <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto py-2.5">
            {['All', ...orderedCategories].map((cat) => {
              const count =
                cat === 'All'
                  ? products.length
                  : products.filter((p) => p.category === cat).length;
              const active = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                    active
                      ? 'bg-coral text-white shadow-2xs'
                      : 'bg-surface text-ink hover:bg-stone-200/70'
                  }`}
                >
                  <span>{cat}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                      active
                        ? 'bg-white/25 text-white'
                        : 'bg-white text-muted'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Smart Filter Pills + Quick Search */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 py-2">
            <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto">
              <span className="hidden items-center gap-1 pr-1 text-[11px] font-bold text-muted sm:inline-flex">
                <SlidersHorizontal className="h-3 w-3" />
                Quick Filters:
              </span>

              <button
                type="button"
                onClick={() =>
                  setFilters((f) => ({ ...f, eggless: !f.eggless }))
                }
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition ${
                  filters.eggless
                    ? 'border-fresh bg-fresh text-white'
                    : 'border-stone-200 bg-white text-ink hover:border-fresh'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    filters.eggless ? 'bg-white' : 'bg-fresh'
                  }`}
                />
                Eggless
              </button>

              <button
                type="button"
                onClick={() =>
                  setFilters((f) => ({ ...f, sugarFree: !f.sugarFree }))
                }
                className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold transition ${
                  filters.sugarFree
                    ? 'border-fresh bg-fresh text-white'
                    : 'border-stone-200 bg-white text-ink hover:border-fresh'
                }`}
              >
                Sugar-Free
              </button>

              <button
                type="button"
                onClick={() =>
                  setFilters((f) => ({ ...f, under500: !f.under500 }))
                }
                className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold transition ${
                  filters.under500
                    ? 'border-ink bg-ink text-white'
                    : 'border-stone-200 bg-white text-ink hover:border-ink'
                }`}
              >
                Under ₹500
              </button>

              <button
                type="button"
                onClick={() =>
                  setFilters((f) => ({ ...f, readyIn30: !f.readyIn30 }))
                }
                className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold transition ${
                  filters.readyIn30
                    ? 'border-coral bg-coral text-white'
                    : 'border-stone-200 bg-white text-ink hover:border-coral'
                }`}
              >
                <Zap className="h-3 w-3" />
                Ready in 30 mins
              </button>

              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setFilters({
                      eggless: false,
                      sugarFree: false,
                      under500: false,
                      readyIn30: false,
                    })
                  }
                  className="inline-flex shrink-0 items-center gap-0.5 px-2 py-1 text-[11px] font-bold text-coral hover:underline"
                >
                  <X className="h-3 w-3" />
                  Reset
                </button>
              )}
            </div>

            <div className="relative w-full sm:w-56">
              <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-stone-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search cakes, croissant, bread..."
                className="w-full rounded-lg border border-stone-200 bg-surface py-1.5 pl-8 pr-3 text-xs font-medium text-ink placeholder:text-stone-400 focus:border-coral focus:bg-white focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. High-Density Sharp Product Grid */}
      <section className="mx-auto max-w-6xl px-3 pt-5 sm:px-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-ink">
            {selectedCategory === 'All' ? 'All Fresh Bakes' : selectedCategory}
            <span className="ml-2 font-semibold text-muted">
              ({visibleProducts.length})
            </span>
          </h2>
          <span className="text-[11px] font-semibold text-muted">
            Tap <strong className="text-coral">+ ADD</strong> on cakes for 500g / 1kg / 2kg &amp; message
          </span>
        </div>

        {visibleProducts.length === 0 ? (
          <div className="rounded-xl border border-stone-200 bg-white p-10 text-center">
            <p className="text-sm font-bold text-ink">
              No items match your active filters
            </p>
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('All');
                setSearch('');
                setFilters({
                  eggless: false,
                  sugarFree: false,
                  under500: false,
                  readyIn30: false,
                });
              }}
              className="mt-3 rounded-lg bg-coral px-4 py-2 text-xs font-bold text-white"
            >
              Show Full Menu
            </button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleProducts.map((product) => {
              const isCake = product.category.toLowerCase().includes('cake');
              const eggless = isProductEggless(product);
              const fastReady = isReadyIn30(product);
              const defaultVariant = product.variants[0];
              const existingDefaultCartItem = defaultVariant
                ? getDefaultVariantItem(defaultVariant.id)
                : undefined;
              const totalProdQty = getProductQuantity(product.id);

              return (
                <article
                  key={product.id}
                  className={`flex flex-col justify-between overflow-hidden rounded-xl border border-stone-200 bg-white p-3.5 transition hover:border-stone-300 hover:shadow-sm ${
                    !product.isActive ? 'opacity-65' : ''
                  }`}
                >
                  <div className="flex gap-3.5">
                    {/* Left: Dense Product Info */}
                    <div className="min-w-0 flex-1">
                      {/* Badges Row */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {eggless && (
                          <span
                            title="100% Eggless / Veg"
                            className="inline-flex h-4 w-4 items-center justify-center rounded-[3px] border-[1.5px] border-fresh"
                          >
                            <span className="h-2 w-2 rounded-full bg-fresh" />
                          </span>
                        )}
                        {eggless && (
                          <span className="rounded bg-fresh/10 px-1.5 py-0.5 text-[10px] font-bold text-fresh">
                            Eggless
                          </span>
                        )}
                        {fastReady ? (
                          <span className="inline-flex items-center gap-0.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                            <Zap className="h-2.5 w-2.5 fill-amber-600 text-amber-600" />
                            30 mins
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 rounded bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                            <Clock className="h-2.5 w-2.5" />
                            {product.leadTimeHours}h notice
                          </span>
                        )}
                        {isProductSugarFree(product) && (
                          <span className="rounded bg-fresh/10 px-1.5 py-0.5 text-[10px] font-bold text-fresh">
                            Sugar-Free
                          </span>
                        )}
                      </div>

                      <Link
                        href={`/products/${product.slug}`}
                        className="mt-1.5 block text-sm font-extrabold leading-snug text-ink hover:text-coral"
                      >
                        {product.name}
                      </Link>

                      <div className="mt-1 flex items-baseline gap-1.5">
                        <span className="text-base font-extrabold text-ink">
                          {formatMoney(product.basePriceCents)}
                        </span>
                        {product.variants.length > 1 && (
                          <span className="text-[11px] font-medium text-muted">
                            • {product.variants[0]?.label.split('•')[0].trim()}
                          </span>
                        )}
                      </div>

                      <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-muted">
                        {product.description}
                      </p>
                    </div>

                    {/* Right: Sharp Image + Overlapping + ADD CTA */}
                    <div className="relative flex w-28 shrink-0 flex-col items-center">
                      <Link
                        href={`/products/${product.slug}`}
                        className="relative block h-24 w-28 overflow-hidden rounded-xl border border-stone-200 bg-surface"
                      >
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="h-full w-full object-cover"
                        />
                        {!product.isActive && (
                          <div className="absolute inset-0 flex items-center justify-center bg-ink/65">
                            <span className="rounded bg-white px-2 py-0.5 text-[10px] font-extrabold uppercase text-ink">
                              Sold Out
                            </span>
                          </div>
                        )}
                      </Link>

                      {/* Primary Action Button / Inline Stepper */}
                      <div className="-mt-3.5 z-10 w-24">
                        {!product.isActive ? (
                          <button
                            type="button"
                            disabled
                            className="w-full cursor-not-allowed rounded-lg border border-stone-200 bg-surface py-1.5 text-[11px] font-bold text-muted"
                          >
                            Sold Out
                          </button>
                        ) : !isCake && existingDefaultCartItem ? (
                          <div className="flex w-full items-center justify-between rounded-lg bg-coral px-1.5 py-1 text-white shadow-sm">
                            <button
                              type="button"
                              aria-label="Decrease quantity"
                              onClick={() =>
                                updateQuantity(
                                  existingDefaultCartItem.key,
                                  existingDefaultCartItem.quantity - 1
                                )
                              }
                              className="p-0.5 hover:bg-white/15 rounded"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="text-xs font-extrabold">
                              {existingDefaultCartItem.quantity}
                            </span>
                            <button
                              type="button"
                              aria-label="Increase quantity"
                              onClick={() =>
                                updateQuantity(
                                  existingDefaultCartItem.key,
                                  existingDefaultCartItem.quantity + 1
                                )
                              }
                              className="p-0.5 hover:bg-white/15 rounded"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handlePrimaryAdd(product)}
                            className="flex w-full items-center justify-center gap-1 rounded-lg border border-coral bg-white py-1.5 text-xs font-extrabold text-coral shadow-sm transition hover:bg-coral hover:text-white"
                          >
                            <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                            ADD
                            {isCake && totalProdQty > 0 && (
                              <span className="ml-0.5 rounded-full bg-coral px-1.5 text-[10px] text-white">
                                {totalProdQty}
                              </span>
                            )}
                          </button>
                        )}
                      </div>

                      {product.isActive && product.variants.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setCustomizingProduct(product)}
                          className="mt-1 inline-flex items-center gap-0.5 text-[10px] font-bold text-muted hover:text-coral"
                        >
                          {isCake ? (
                            <>
                              <Sparkles className="h-2.5 w-2.5 text-coral" />
                              Customisable
                            </>
                          ) : (
                            `${product.variants.length} pack sizes`
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Inline Customization Bottom Sheet Modal */}
      {customizingProduct && (
        <QuickCustomizeSheet
          product={customizingProduct}
          onClose={() => setCustomizingProduct(null)}
        />
      )}
    </div>
  );
}
