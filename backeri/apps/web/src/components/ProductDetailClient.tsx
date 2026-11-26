'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  ImagePlus,
  Loader2,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';
import { formatMoney } from '@backeri/shared';
import { apiFetch } from '@/lib/api';
import type { ProductDTO } from '@/lib/types';
import { useAuth } from './AuthProvider';
import { useCart } from './CartProvider';

export function ProductDetailClient({ product }: { product: ProductDTO }) {
  const { user } = useAuth();
  const { addItem } = useCart();

  const [selectedVariantId, setSelectedVariantId] = useState(
    product.variants[0]?.id ?? ''
  );
  const [quantity, setQuantity] = useState(1);
  const [inscription, setInscription] = useState('');
  const [dietaryNotes, setDietaryNotes] = useState('');
  const [referenceImageUrl, setReferenceImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const selectedVariant =
    product.variants.find((v) => v.id === selectedVariantId) ??
    product.variants[0];

  const unitPriceCents =
    product.basePriceCents + (selectedVariant?.priceDeltaCents ?? 0);

  const handleImageUpload = async (file: File) => {
    setUploadError('');
    if (!user) {
      setUploadError('Please sign in at Checkout first to upload a cake inspiration photo.');
      return;
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setUploadError('Only JPG, PNG, or WEBP images are supported.');
      return;
    }

    setUploading(true);
    try {
      // 1. Request pre-signed direct upload URL from backend
      const presigned = await apiFetch<{
        uploadUrl: string;
        publicUrl: string;
        headers: Record<string, string>;
      }>('/api/v1/uploads/presign', {
        method: 'POST',
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
        }),
      });

      // 2. Upload binary directly to pre-signed URL
      const putRes = await fetch(presigned.uploadUrl, {
        method: 'PUT',
        headers: presigned.headers,
        body: file,
      });

      if (!putRes.ok) {
        throw new Error('Direct image upload failed');
      }

      setReferenceImageUrl(presigned.publicUrl);
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'Failed to upload inspiration photo'
      );
    } finally {
      setUploading(false);
    }
  };

  const handleAddToBasket = () => {
    if (!selectedVariant || !product.isActive) return;

    const customNotes =
      inscription.trim() || dietaryNotes.trim() || referenceImageUrl
        ? {
            inscription: inscription.trim() || undefined,
            dietaryNotes: dietaryNotes.trim() || undefined,
            referenceImageUrl: referenceImageUrl || undefined,
          }
        : undefined;

    addItem({
      productId: product.id,
      productName: product.name,
      productImage: product.imageUrl,
      leadTimeHours: product.leadTimeHours,
      variantId: selectedVariant.id,
      variantLabel: selectedVariant.label,
      unitPriceCents,
      quantity,
      customNotes,
    });
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-xs font-semibold text-cocoa hover:text-terracotta"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Daily Menu
      </Link>

      <div className="grid gap-8 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <div className="overflow-hidden rounded-3xl border border-wheat bg-white shadow-sm">
            <img
              src={product.imageUrl}
              alt={product.name}
              className="aspect-[4/3] w-full object-cover"
            />
          </div>

          <div className="mt-4 rounded-2xl border border-wheat bg-parchment/70 p-4 text-xs text-cocoa">
            <div className="flex items-center gap-2 font-semibold text-espresso">
              <Clock className="h-4 w-4 text-terracotta" />
              Minimum Kitchen Notice: {product.leadTimeHours} hours
            </div>
            <p className="mt-1 leading-relaxed">
              Checkout will automatically filter pickup &amp; delivery windows to slots
              at least {product.leadTimeHours} hours from now.
            </p>
          </div>
        </div>

        <div className="lg:col-span-7">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-terracotta">
            {product.category}
          </span>
          <h1 className="mt-1 font-serif text-3xl font-bold text-espresso">
            {product.name}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-cocoa">
            {product.description}
          </p>

          <div className="mt-5 font-serif text-2xl font-bold text-espresso">
            {formatMoney(unitPriceCents)}
          </div>

          {/* Variants */}
          <div className="mt-6">
            <label className="block text-xs font-bold uppercase tracking-wider text-cocoa">
              Choose Size / Variation
            </label>
            <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
              {product.variants.map((variant) => {
                const selected = variant.id === selectedVariant?.id;
                const price = product.basePriceCents + variant.priceDeltaCents;
                return (
                  <button
                    key={variant.id}
                    type="button"
                    onClick={() => setSelectedVariantId(variant.id)}
                    className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left text-xs font-semibold transition ${
                      selected
                        ? 'border-terracotta bg-terracotta/5 text-espresso ring-1 ring-terracotta'
                        : 'border-wheat bg-white text-cocoa hover:border-espresso/40'
                    }`}
                  >
                    <span>{variant.label}</span>
                    <span className="font-bold text-espresso">
                      {formatMoney(price)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Customizations */}
          <div className="mt-6 space-y-4 rounded-2xl border border-wheat bg-white p-5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-espresso">
              <Sparkles className="h-4 w-4 text-terracotta" />
              Personalization &amp; Bakery Notes (Optional)
            </div>

            <div>
              <label className="block text-xs font-medium text-cocoa">
                Frosting Inscription / Plaque Message
              </label>
              <input
                type="text"
                maxLength={120}
                value={inscription}
                onChange={(e) => setInscription(e.target.value)}
                placeholder='e.g., "Happy 30th Birthday Maya!"'
                className="mt-1 w-full rounded-xl border border-wheat bg-cream/60 px-3.5 py-2.5 text-sm text-espresso placeholder:text-cocoa/45 focus:border-terracotta focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-cocoa">
                Allergies or Preparation Notes
              </label>
              <textarea
                rows={2}
                maxLength={250}
                value={dietaryNotes}
                onChange={(e) => setDietaryNotes(e.target.value)}
                placeholder="e.g., Slice loaf thick, nut allergy in household, pastel buttercream..."
                className="mt-1 w-full rounded-xl border border-wheat bg-cream/60 px-3.5 py-2 text-sm text-espresso placeholder:text-cocoa/45 focus:border-terracotta focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-cocoa">
                Custom Cake Inspiration Photo (Pre-Signed Direct Upload)
              </label>
              <div className="mt-1.5 flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-terracotta/60 bg-cream/60 px-4 py-2 text-xs font-semibold text-espresso hover:bg-parchment/60">
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-terracotta" />
                  ) : (
                    <ImagePlus className="h-4 w-4 text-terracotta" />
                  )}
                  <span>{uploading ? 'Uploading...' : 'Upload Reference Image'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleImageUpload(f);
                    }}
                  />
                </label>

                {referenceImageUrl && (
                  <div className="flex items-center gap-2 text-xs font-semibold text-sage">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Uploaded</span>
                    <img
                      src={referenceImageUrl}
                      alt="Inspiration preview"
                      className="h-10 w-10 rounded-lg border border-wheat object-cover"
                    />
                  </div>
                )}
              </div>
              {uploadError && (
                <p className="mt-1.5 text-xs text-red-600">{uploadError}</p>
              )}
            </div>
          </div>

          {/* Quantity & Add */}
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <div className="flex items-center rounded-xl border border-wheat bg-white">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="px-4 py-3 text-sm font-bold text-cocoa hover:text-espresso"
              >
                −
              </button>
              <span className="min-w-[36px] text-center text-sm font-bold text-espresso">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(20, q + 1))}
                className="px-4 py-3 text-sm font-bold text-cocoa hover:text-espresso"
              >
                +
              </button>
            </div>

            <button
              type="button"
              disabled={!product.isActive}
              onClick={handleAddToBasket}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-terracotta px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-terracotta-dark disabled:cursor-not-allowed disabled:bg-wheat disabled:text-cocoa"
            >
              <ShoppingBag className="h-4 w-4" />
              {product.isActive
                ? `Add to Basket • ${formatMoney(unitPriceCents * quantity)}`
                : 'Currently Sold Out'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
