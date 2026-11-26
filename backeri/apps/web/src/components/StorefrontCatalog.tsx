'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Clock, Plus, Sparkles } from 'lucide-react';
import { formatMoney } from '@backeri/shared';
import type { ProductDTO } from '@/lib/types';
import { useCart } from './CartProvider';

export function StorefrontCatalog({
  categories,
  products,
}: {
  categories: string[];
  products: ProductDTO[];
}) {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const { addItem } = useCart();

  const visibleProducts =
    selectedCategory === 'All'
      ? products
      : products.filter((p) => p.category === selectedCategory);

  const handleQuickAdd = (product: ProductDTO) => {
    const defaultVariant = product.variants[0];
    if (!defaultVariant || !product.isActive) return;

    addItem({
      productId: product.id,
      productName: product.name,
      productImage: product.imageUrl,
      leadTimeHours: product.leadTimeHours,
      variantId: defaultVariant.id,
      variantLabel: defaultVariant.label,
      unitPriceCents: product.basePriceCents + defaultVariant.priceDeltaCents,
      quantity: 1,
    });
  };

  return (
    <section id="menu" className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-terracotta">
            Baked Fresh in Limited Batches
          </p>
          <h2 className="mt-1 font-serif text-3xl font-bold text-espresso">
            Today&apos;s Menu &amp; Pre-Orders
          </h2>
        </div>

        <div className="flex flex-wrap gap-2">
          {['All', ...categories].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                selectedCategory === cat
                  ? 'bg-espresso text-cream shadow-sm'
                  : 'border border-wheat bg-white text-cocoa hover:border-terracotta hover:text-terracotta'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {visibleProducts.map((product) => {
          const isCustomCake = product.category === 'Celebration Cakes';
          return (
            <article
              key={product.id}
              className={`group flex flex-col overflow-hidden rounded-2xl border border-wheat/80 bg-white shadow-xs transition hover:shadow-md ${
                !product.isActive ? 'opacity-70' : ''
              }`}
            >
              <Link
                href={`/products/${product.slug}`}
                className="relative block aspect-[10/7] overflow-hidden bg-parchment"
              >
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                />
                {!product.isActive && (
                  <div className="absolute inset-0 flex items-center justify-center bg-espresso/55">
                    <span className="rounded-full bg-cream px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-espresso">
                      Sold Out Today
                    </span>
                  </div>
                )}
                <div className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-cream/95 px-2.5 py-1 text-[11px] font-semibold text-espresso shadow-xs">
                  <Clock className="h-3 w-3 text-terracotta" />
                  <span>{product.leadTimeHours}h notice</span>
                </div>
              </Link>

              <div className="flex flex-1 flex-col p-5">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-terracotta">
                    {product.category}
                  </span>
                  <span className="font-serif text-base font-bold text-espresso">
                    {formatMoney(product.basePriceCents)}
                    {product.variants.length > 1 ? '+' : ''}
                  </span>
                </div>

                <Link
                  href={`/products/${product.slug}`}
                  className="font-serif text-lg font-bold text-espresso hover:text-terracotta"
                >
                  {product.name}
                </Link>
                <p className="mt-1.5 line-clamp-2 flex-1 text-xs leading-relaxed text-cocoa">
                  {product.description}
                </p>

                {product.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {product.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-parchment px-2.5 py-0.5 text-[10px] font-semibold text-cocoa"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-4 flex items-center gap-2 pt-3 border-t border-wheat/60">
                  <Link
                    href={`/products/${product.slug}`}
                    className="flex-1 rounded-xl border border-wheat py-2 text-center text-xs font-semibold text-espresso transition hover:border-espresso hover:bg-parchment/50"
                  >
                    {isCustomCake ? (
                      <span className="inline-flex items-center gap-1">
                        <Sparkles className="h-3.5 w-3.5 text-terracotta" />
                        Customize Cake
                      </span>
                    ) : (
                      'Select Options'
                    )}
                  </Link>

                  {product.isActive && !isCustomCake && (
                    <button
                      onClick={() => handleQuickAdd(product)}
                      className="inline-flex items-center gap-1 rounded-xl bg-espresso px-3.5 py-2 text-xs font-semibold text-cream transition hover:bg-terracotta"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
