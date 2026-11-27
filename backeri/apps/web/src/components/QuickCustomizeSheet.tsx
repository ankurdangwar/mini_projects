'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Clock, Sparkles, X } from 'lucide-react';
import { formatMoney } from '@backeri/shared';
import type { ProductDTO, ProductVariantDTO } from '@/lib/types';
import { useCart } from './CartProvider';

const QUICK_MESSAGES = [
  'Happy Birthday!',
  'Happy Anniversary!',
  'Congratulations!',
  'Best Wishes!',
];

interface ParsedCakeVariant {
  variant: ProductVariantDTO;
  weight: string;
  eggless: boolean;
}

function parseCakeVariants(variants: ProductVariantDTO[]): {
  isWeightEggMatrix: boolean;
  weights: string[];
  hasEggOption: boolean;
  hasEgglessOption: boolean;
  parsed: ParsedCakeVariant[];
} {
  const parsed: ParsedCakeVariant[] = [];
  for (const v of variants) {
    const weightMatch = v.label.match(/\b(500g|1kg|2kg)\b/i);
    if (weightMatch) {
      const weight = weightMatch[1].toLowerCase();
      const eggless = !/with\s*egg/i.test(v.label);
      parsed.push({ variant: v, weight, eggless });
    }
  }

  const weights = Array.from(new Set(parsed.map((p) => p.weight)));
  const hasEgglessOption = parsed.some((p) => p.eggless);
  const hasEggOption = parsed.some((p) => !p.eggless);

  return {
    isWeightEggMatrix: parsed.length === variants.length && weights.length > 0,
    weights,
    hasEggOption,
    hasEgglessOption,
    parsed,
  };
}

export function QuickCustomizeSheet({
  product,
  onClose,
}: {
  product: ProductDTO;
  onClose: () => void;
}) {
  const { addItem } = useCart();

  const matrix = useMemo(
    () => parseCakeVariants(product.variants),
    [product.variants]
  );

  const [selectedWeight, setSelectedWeight] = useState(
    matrix.weights[0] ?? '500g'
  );
  const [isEggless, setIsEggless] = useState(true);
  const [selectedVariantId, setSelectedVariantId] = useState(
    product.variants[0]?.id ?? ''
  );
  const [cakeMessage, setCakeMessage] = useState('');

  // Resolve active variant
  const activeVariant: ProductVariantDTO | undefined = useMemo(() => {
    if (!matrix.isWeightEggMatrix) {
      return (
        product.variants.find((v) => v.id === selectedVariantId) ??
        product.variants[0]
      );
    }
    const exact = matrix.parsed.find(
      (p) => p.weight === selectedWeight && p.eggless === isEggless
    );
    if (exact) return exact.variant;
    const sameWeight = matrix.parsed.find((p) => p.weight === selectedWeight);
    return sameWeight?.variant ?? product.variants[0];
  }, [matrix, product.variants, selectedVariantId, selectedWeight, isEggless]);

  const unitPriceCents =
    product.basePriceCents + (activeVariant?.priceDeltaCents ?? 0);

  const isCake =
    product.category.toLowerCase().includes('cake') || matrix.isWeightEggMatrix;

  const handleConfirm = () => {
    if (!activeVariant) return;

    const notes: { inscription?: string; dietaryNotes?: string } = {};
    if (cakeMessage.trim()) {
      notes.inscription = cakeMessage.trim();
    }
    if (!matrix.isWeightEggMatrix && isCake) {
      notes.dietaryNotes = isEggless ? 'Eggless preference' : 'With Egg';
    }

    addItem(
      {
        productId: product.id,
        productName: product.name,
        productImage: product.imageUrl,
        leadTimeHours: product.leadTimeHours,
        variantId: activeVariant.id,
        variantLabel: activeVariant.label,
        unitPriceCents,
        quantity: 1,
        customNotes:
          notes.inscription || notes.dietaryNotes ? notes : undefined,
      },
      { openDrawer: false }
    );
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-2.5 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-stone-300" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-stone-200 px-5 py-4">
          <div className="flex gap-3">
            <img
              src={product.imageUrl}
              alt={product.name}
              className="h-14 w-14 rounded-xl border border-stone-200 object-cover"
            />
            <div>
              <div className="flex items-center gap-1.5">
                <span
                  title="Eggless Available"
                  className="inline-flex h-4 w-4 items-center justify-center rounded-xs border-2 border-fresh"
                >
                  <span className="h-2 w-2 rounded-full bg-fresh" />
                </span>
                <span className="text-[11px] font-bold uppercase tracking-wider text-fresh">
                  {product.category}
                </span>
                <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-muted">
                  • <Clock className="h-3 w-3 text-coral" />
                  {product.leadTimeHours === 0
                    ? 'Ready in 30m'
                    : `${product.leadTimeHours}h notice`}
                </span>
              </div>
              <h3 className="mt-0.5 text-base font-extrabold text-ink leading-snug">
                {product.name}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-surface"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-5 py-4">
          {matrix.isWeightEggMatrix ? (
            <>
              {/* Weight Selector (500g / 1kg / 2kg) */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-extrabold uppercase tracking-wider text-ink">
                    Select Weight
                  </label>
                  <span className="text-[11px] font-semibold text-muted">
                    Required • 1 option
                  </span>
                </div>
                <div className="mt-2.5 grid grid-cols-3 gap-2.5">
                  {matrix.weights.map((w) => {
                    const sample =
                      matrix.parsed.find(
                        (p) => p.weight === w && p.eggless === isEggless
                      ) ?? matrix.parsed.find((p) => p.weight === w);
                    const price =
                      product.basePriceCents +
                      (sample?.variant.priceDeltaCents ?? 0);
                    const active = selectedWeight === w;
                    return (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setSelectedWeight(w)}
                        className={`rounded-xl border-2 px-3 py-2.5 text-center transition ${
                          active
                            ? 'border-coral bg-coral/5 text-ink'
                            : 'border-stone-200 bg-white text-muted hover:border-stone-300'
                        }`}
                      >
                        <span className="block text-sm font-extrabold uppercase text-ink">
                          {w}
                        </span>
                        <span className="mt-0.5 block text-xs font-bold text-coral">
                          {formatMoney(price)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Eggless / With Egg Toggle */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-ink">
                  Dietary Preference
                </label>
                <div className="mt-2 grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsEggless(true)}
                    className={`flex items-center justify-center gap-2 rounded-xl border-2 py-2.5 text-xs font-bold transition ${
                      isEggless
                        ? 'border-fresh bg-fresh/10 text-fresh'
                        : 'border-stone-200 bg-white text-muted'
                    }`}
                  >
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-xs border-2 border-fresh">
                      <span className="h-2 w-2 rounded-full bg-fresh" />
                    </span>
                    100% Eggless
                  </button>
                  <button
                    type="button"
                    disabled={!matrix.hasEggOption}
                    onClick={() => setIsEggless(false)}
                    className={`flex items-center justify-center gap-2 rounded-xl border-2 py-2.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      !isEggless
                        ? 'border-ink bg-ink/5 text-ink'
                        : 'border-stone-200 bg-white text-muted'
                    }`}
                  >
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-xs border-2 border-amber-700">
                      <span className="h-2 w-2 rounded-full bg-amber-700" />
                    </span>
                    {matrix.hasEggOption ? 'With Egg' : 'Eggless Only'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* Generic Variant Picker for Boxes / Breads / Combos */
            <div>
              <label className="block text-xs font-extrabold uppercase tracking-wider text-ink">
                Choose Size / Pack
              </label>
              <div className="mt-2 space-y-2">
                {product.variants.map((v) => {
                  const selected = v.id === activeVariant?.id;
                  const price = product.basePriceCents + v.priceDeltaCents;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedVariantId(v.id)}
                      className={`flex w-full items-center justify-between rounded-xl border-2 px-3.5 py-2.5 text-left text-xs font-bold transition ${
                        selected
                          ? 'border-coral bg-coral/5 text-ink'
                          : 'border-stone-200 bg-white text-muted hover:border-stone-300'
                      }`}
                    >
                      <span>{v.label}</span>
                      <span className="text-sm font-extrabold text-ink">
                        {formatMoney(price)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Cake Message Text Input */}
          {isCake && (
            <div>
              <label className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-ink">
                <span>Cake Message (Optional)</span>
                <span className="font-normal normal-case text-[11px] text-muted">
                  Free chocolate plaque
                </span>
              </label>
              <input
                type="text"
                maxLength={80}
                value={cakeMessage}
                onChange={(e) => setCakeMessage(e.target.value)}
                placeholder='e.g., "Happy Birthday Aarav!"'
                className="mt-2 w-full rounded-xl border border-stone-300 bg-surface/60 px-3.5 py-2.5 text-sm font-medium text-ink placeholder:text-stone-400 focus:border-coral focus:bg-white focus:outline-none"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {QUICK_MESSAGES.map((msg) => (
                  <button
                    key={msg}
                    type="button"
                    onClick={() => setCakeMessage(msg)}
                    className="rounded-full border border-stone-200 bg-surface px-2.5 py-1 text-[11px] font-semibold text-muted hover:border-coral hover:text-coral"
                  >
                    {msg}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between rounded-xl bg-surface px-3.5 py-2.5 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-coral" />
              Want to upload a cake reference photo?
            </span>
            <Link
              href={`/products/${product.slug}`}
              onClick={onClose}
              className="font-bold text-coral hover:underline"
            >
              Full Customizer →
            </Link>
          </div>
        </div>

        {/* Sticky Footer CTA */}
        <div className="border-t border-stone-200 bg-white px-5 py-3.5 rounded-b-2xl">
          <button
            type="button"
            onClick={handleConfirm}
            className="flex w-full items-center justify-between rounded-xl bg-coral px-5 py-3.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-coral-dark"
          >
            <span>Add Item to Cart</span>
            <span>{formatMoney(unitPriceCents)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
