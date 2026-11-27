'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Edit3,
  ImagePlus,
  Layers,
  Loader2,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { formatMoney } from '@backeri/shared';
import { apiFetch } from '@/lib/api';
import type { MenuResponse, ProductDTO, ProductVariantDTO } from '@/lib/types';
import { useAuth } from '@/components/AuthProvider';

const PRESET_CATEGORIES = [
  'Artisan Breads',
  'Viennoiserie',
  'Celebration Cakes',
  'Seasonal Tarts',
  'Cookies & Bars',
];

const PRESET_IMAGES = [
  { label: 'Sourdough', url: '/images/sourdough.svg' },
  { label: 'Dark Rye', url: '/images/rye.svg' },
  { label: 'Croissant', url: '/images/croissant.svg' },
  { label: 'Cardamom', url: '/images/cardamom.svg' },
  { label: 'Pain au Choc', url: '/images/pain-chocolat.svg' },
  { label: 'Choc Cake', url: '/images/chocolate-cake.svg' },
  { label: 'Pistachio', url: '/images/pistachio-cake.svg' },
  { label: 'Tiered Cake', url: '/images/tiered-cake.svg' },
  { label: 'Cheesecake', url: '/images/basque-cheesecake.svg' },
  { label: 'Lemon Tart', url: '/images/lemon-tart.svg' },
];

interface ProductFormState {
  name: string;
  category: string;
  description: string;
  basePriceDollars: string;
  leadTimeHours: string;
  tagsText: string;
  imageUrl: string;
  isActive: boolean;
  variants: Array<{ label: string; priceDeltaDollars: string }>;
}

function emptyProductForm(): ProductFormState {
  return {
    name: '',
    category: 'Celebration Cakes',
    description: '',
    basePriceDollars: '48.00',
    leadTimeHours: '24',
    tagsText: '24h Notice, Custom Inscription',
    imageUrl: '/images/chocolate-cake.svg',
    isActive: true,
    variants: [
      { label: '6-inch (Serves 8–10)', priceDeltaDollars: '0.00' },
      { label: '6-inch Eggless', priceDeltaDollars: '4.00' },
    ],
  };
}

function dollarsToCents(raw: string): number {
  const num = Number(raw);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}

function centsToDollarsInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export default function AdminMenuPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState<ProductDTO[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [flashMsg, setFlashMsg] = useState<string | null>(null);

  // Modal state (null = closed, 'create' = new product, ProductDTO = edit product)
  const [modalMode, setModalMode] = useState<null | 'create' | ProductDTO>(null);
  const [form, setForm] = useState<ProductFormState>(emptyProductForm);
  const [savingProduct, setSavingProduct] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [formError, setFormError] = useState('');

  // Inline variant forms keyed by productId / variantId
  const [newVariantDraft, setNewVariantDraft] = useState<
    Record<string, { label: string; deltaDollars: string }>
  >({});
  const [editingVariant, setEditingVariant] = useState<{
    productId: string;
    variantId: string;
    label: string;
    deltaDollars: string;
  } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const flash = (msg: string) => {
    setFlashMsg(msg);
    setTimeout(() => setFlashMsg(null), 4500);
  };

  const loadMenu = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<MenuResponse>('/api/v1/admin/products');
      setProducts(data.products);
      setCategories(data.categories);
    } catch (err) {
      console.error('Failed to load admin menu:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      loadMenu();
    } else {
      setLoading(false);
    }
  }, [user, loadMenu]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryFilter !== 'All' && p.category !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.variants.some((v) => v.label.toLowerCase().includes(q))
      );
    });
  }, [products, search, categoryFilter]);

  if (user?.role !== 'ADMIN') {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-amber-700" />
        <h1 className="mt-3 font-serif text-2xl font-bold text-espresso">
          Admin Access Required
        </h1>
        <p className="mt-1 text-sm text-cocoa">
          Creating products, editing pricing, and managing variants are restricted to the{' '}
          <strong>ADMIN</strong> role. Bakers can mark items Sold Out from{' '}
          <Link href="/admin/slots" className="font-semibold text-terracotta underline">
            Slots &amp; Sold Out
          </Link>
          .
        </p>
      </div>
    );
  }

  const openCreateModal = () => {
    setFormError('');
    setForm(emptyProductForm());
    setModalMode('create');
  };

  const openEditModal = (product: ProductDTO) => {
    setFormError('');
    setForm({
      name: product.name,
      category: product.category,
      description: product.description,
      basePriceDollars: centsToDollarsInput(product.basePriceCents),
      leadTimeHours: String(product.leadTimeHours),
      tagsText: product.tags.join(', '),
      imageUrl: product.imageUrl,
      isActive: product.isActive,
      variants: [],
    });
    setModalMode(product);
  };

  const handleImageUpload = async (file: File) => {
    setFormError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFormError('Only JPG, PNG, or WEBP images are supported.');
      return;
    }

    setUploadingImage(true);
    try {
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

      const putRes = await fetch(presigned.uploadUrl, {
        method: 'PUT',
        headers: presigned.headers,
        body: file,
      });
      if (!putRes.ok) {
        throw new Error('Image upload failed');
      }

      setForm((prev) => ({ ...prev, imageUrl: presigned.publicUrl }));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const basePriceCents = dollarsToCents(form.basePriceDollars);
    const leadTimeHours = Number(form.leadTimeHours);
    if (basePriceCents < 50) {
      setFormError('Base price must be at least $0.50.');
      return;
    }
    if (!Number.isInteger(leadTimeHours) || leadTimeHours < 0 || leadTimeHours > 168) {
      setFormError('Lead time must be a whole number between 0 and 168 hours.');
      return;
    }

    const tags = form.tagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    setSavingProduct(true);
    try {
      if (modalMode === 'create') {
        const cleanedVariants = form.variants
          .filter((v) => v.label.trim().length > 0)
          .map((v) => ({
            label: v.label.trim(),
            priceDeltaCents: dollarsToCents(v.priceDeltaDollars),
          }));

        if (cleanedVariants.length === 0) {
          setFormError('Please add at least one variant (e.g., "Standard").');
          setSavingProduct(false);
          return;
        }

        const res = await apiFetch<{ product: ProductDTO }>('/api/v1/admin/products', {
          method: 'POST',
          body: JSON.stringify({
            name: form.name.trim(),
            category: form.category.trim(),
            description: form.description.trim(),
            basePriceCents,
            leadTimeHours,
            isActive: form.isActive,
            imageUrl: form.imageUrl,
            tags,
            variants: cleanedVariants,
          }),
        });

        setModalMode(null);
        setExpandedIds((prev) => ({ ...prev, [res.product.id]: true }));
        flash(`Created "${res.product.name}" (Redis menu cache refreshed).`);
        await loadMenu();
      } else if (modalMode) {
        const res = await apiFetch<{ product: ProductDTO }>(
          `/api/v1/admin/products/${modalMode.id}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              name: form.name.trim(),
              category: form.category.trim(),
              description: form.description.trim(),
              basePriceCents,
              leadTimeHours,
              isActive: form.isActive,
              imageUrl: form.imageUrl,
              tags,
            }),
          }
        );

        setModalMode(null);
        flash(`Updated "${res.product.name}" (Redis menu cache refreshed).`);
        await loadMenu();
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save product');
    } finally {
      setSavingProduct(false);
    }
  };

  const handleToggleProductActive = async (product: ProductDTO) => {
    setBusyKey(`prod-toggle-${product.id}`);
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
        `"${product.name}" is now ${res.product.isActive ? 'In Stock' : 'Sold Out'}.`
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update product');
    } finally {
      setBusyKey(null);
    }
  };

  const handleDeleteProduct = async (product: ProductDTO) => {
    if (
      !window.confirm(
        `Delete "${product.name}"? If it has existing orders, it will be safely archived (Sold Out) instead.`
      )
    ) {
      return;
    }

    setBusyKey(`prod-del-${product.id}`);
    try {
      const res = await apiFetch<{
        deleted: boolean;
        archived: boolean;
        message: string;
      }>(`/api/v1/admin/products/${product.id}`, {
        method: 'DELETE',
      });
      flash(res.message);
      await loadMenu();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusyKey(null);
    }
  };

  const handleAddVariant = async (productId: string) => {
    const draft = newVariantDraft[productId];
    if (!draft?.label?.trim()) return;

    setBusyKey(`var-add-${productId}`);
    try {
      await apiFetch(`/api/v1/admin/products/${productId}/variants`, {
        method: 'POST',
        body: JSON.stringify({
          label: draft.label.trim(),
          priceDeltaCents: dollarsToCents(draft.deltaDollars || '0'),
        }),
      });
      setNewVariantDraft((prev) => ({
        ...prev,
        [productId]: { label: '', deltaDollars: '0.00' },
      }));
      flash(`Added variant "${draft.label.trim()}".`);
      await loadMenu();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add variant');
    } finally {
      setBusyKey(null);
    }
  };

  const handleSaveVariantEdit = async () => {
    if (!editingVariant || !editingVariant.label.trim()) return;

    setBusyKey(`var-edit-${editingVariant.variantId}`);
    try {
      await apiFetch(
        `/api/v1/admin/products/${editingVariant.productId}/variants/${editingVariant.variantId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            label: editingVariant.label.trim(),
            priceDeltaCents: dollarsToCents(editingVariant.deltaDollars || '0'),
          }),
        }
      );
      setEditingVariant(null);
      flash('Variant updated.');
      await loadMenu();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update variant');
    } finally {
      setBusyKey(null);
    }
  };

  const handleToggleVariantActive = async (
    productId: string,
    variant: ProductVariantDTO
  ) => {
    setBusyKey(`var-toggle-${variant.id}`);
    try {
      await apiFetch(
        `/api/v1/admin/products/${productId}/variants/${variant.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ isActive: !variant.isActive }),
        }
      );
      flash(
        `Variant "${variant.label}" ${!variant.isActive ? 'activated' : 'hidden'}.`
      );
      await loadMenu();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to toggle variant');
    } finally {
      setBusyKey(null);
    }
  };

  const handleDeleteVariant = async (
    productId: string,
    variant: ProductVariantDTO
  ) => {
    if (
      !window.confirm(
        `Remove variant "${variant.label}"? If it has existing orders, it will be deactivated instead.`
      )
    ) {
      return;
    }

    setBusyKey(`var-del-${variant.id}`);
    try {
      const res = await apiFetch<{ message: string }>(
        `/api/v1/admin/products/${productId}/variants/${variant.id}`,
        { method: 'DELETE' }
      );
      flash(res.message);
      await loadMenu();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove variant');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-espresso">
            Menu, Pricing &amp; Variant Manager
          </h1>
          <p className="mt-0.5 text-xs text-cocoa">
            Create bakery items, adjust base prices &amp; prep lead times, and manage
            size/dietary variants (Eggless, Gluten-Free, Box sizes). Changes clear the
            Redis menu cache immediately.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 rounded-xl bg-terracotta px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-terracotta-dark"
        >
          <Plus className="h-4 w-4" />
          New Product
        </button>
      </div>

      {flashMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-sage/40 bg-sage/15 px-4 py-2.5 text-xs font-semibold text-espresso">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-sage" />
          <span>{flashMsg}</span>
        </div>
      )}

      {/* Search & Category Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-wheat bg-white p-4">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-cocoa/50" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products, categories, or variants..."
            className="w-full rounded-xl border border-wheat bg-cream/60 py-2 pl-9 pr-3 text-xs text-espresso focus:border-terracotta focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {['All', ...categories].map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                categoryFilter === cat
                  ? 'bg-espresso text-cream'
                  : 'border border-wheat bg-cream/50 text-cocoa hover:border-terracotta'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Product List */}
      {loading ? (
        <p className="text-sm text-cocoa">Loading bakery catalog...</p>
      ) : filteredProducts.length === 0 ? (
        <div className="rounded-2xl border border-wheat bg-white p-12 text-center">
          <p className="font-serif text-lg font-bold text-espresso">
            No matching products
          </p>
          <p className="mt-1 text-xs text-cocoa">
            Try clearing your search or create a new menu item.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredProducts.map((product) => {
            const expanded = Boolean(expandedIds[product.id]);
            const draft = newVariantDraft[product.id] ?? {
              label: '',
              deltaDollars: '0.00',
            };

            return (
              <article
                key={product.id}
                className="overflow-hidden rounded-2xl border border-wheat bg-white shadow-xs"
              >
                <div className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="h-16 w-20 shrink-0 rounded-xl border border-wheat object-cover"
                  />

                  <div className="min-w-[200px] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-terracotta">
                        {product.category}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-parchment px-2 py-0.5 text-[10px] font-semibold text-cocoa">
                        <Clock className="h-3 w-3 text-terracotta" />
                        {product.leadTimeHours}h notice
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-parchment px-2 py-0.5 text-[10px] font-semibold text-cocoa">
                        <Layers className="h-3 w-3 text-espresso" />
                        {product.variants.length}{' '}
                        {product.variants.length === 1 ? 'variant' : 'variants'}
                      </span>
                    </div>

                    <h2 className="mt-1 font-serif text-lg font-bold text-espresso">
                      {product.name}
                    </h2>
                    <p className="line-clamp-1 text-xs text-cocoa">
                      {product.description}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wider text-cocoa">
                      Base Price
                    </p>
                    <p className="font-serif text-xl font-bold text-espresso">
                      {formatMoney(product.basePriceCents)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      disabled={busyKey === `prod-toggle-${product.id}`}
                      onClick={() => handleToggleProductActive(product)}
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                        product.isActive
                          ? 'bg-sage/15 text-sage hover:bg-red-100 hover:text-red-700'
                          : 'bg-red-100 text-red-700 hover:bg-sage/15 hover:text-sage'
                      }`}
                    >
                      {product.isActive ? (
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

                    <button
                      onClick={() => openEditModal(product)}
                      className="inline-flex items-center gap-1 rounded-xl border border-wheat bg-cream/60 px-3 py-1.5 text-xs font-semibold text-espresso hover:border-espresso"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Edit
                    </button>

                    <button
                      disabled={busyKey === `prod-del-${product.id}`}
                      onClick={() => handleDeleteProduct(product)}
                      title="Delete or archive product"
                      className="rounded-xl border border-red-200 p-1.5 text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>

                    <button
                      onClick={() =>
                        setExpandedIds((prev) => ({
                          ...prev,
                          [product.id]: !prev[product.id],
                        }))
                      }
                      className="inline-flex items-center gap-1 rounded-xl bg-espresso px-3 py-1.5 text-xs font-semibold text-cream hover:bg-terracotta"
                    >
                      <span>Variants</span>
                      {expanded ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expandable Variant Manager */}
                {expanded && (
                  <div className="border-t border-wheat bg-cream/50 px-5 py-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-xs font-bold uppercase tracking-wider text-cocoa">
                        Product Variants (Sizes, Dietary, Flavors)
                      </p>
                      <span className="text-[11px] text-cocoa">
                        Final Price = Base ({formatMoney(product.basePriceCents)}) + Delta
                      </span>
                    </div>

                    <div className="space-y-2">
                      {product.variants.map((variant) => {
                        const isEditing =
                          editingVariant?.variantId === variant.id;
                        const finalCents =
                          product.basePriceCents + variant.priceDeltaCents;

                        return (
                          <div
                            key={variant.id}
                            className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-xs ${
                              variant.isActive
                                ? 'border-wheat bg-white'
                                : 'border-wheat/60 bg-parchment/60 opacity-75'
                            }`}
                          >
                            {isEditing ? (
                              <div className="flex flex-1 flex-wrap items-center gap-2">
                                <input
                                  type="text"
                                  value={editingVariant.label}
                                  onChange={(e) =>
                                    setEditingVariant({
                                      ...editingVariant,
                                      label: e.target.value,
                                    })
                                  }
                                  className="min-w-[180px] flex-1 rounded-lg border border-terracotta px-2.5 py-1.5 text-xs"
                                />
                                <div className="flex items-center gap-1">
                                  <span className="text-cocoa">+$</span>
                                  <input
                                    type="number"
                                    step="0.25"
                                    value={editingVariant.deltaDollars}
                                    onChange={(e) =>
                                      setEditingVariant({
                                        ...editingVariant,
                                        deltaDollars: e.target.value,
                                      })
                                    }
                                    className="w-24 rounded-lg border border-terracotta px-2 py-1.5 text-xs"
                                  />
                                </div>
                                <button
                                  onClick={handleSaveVariantEdit}
                                  disabled={busyKey === `var-edit-${variant.id}`}
                                  className="inline-flex items-center gap-1 rounded-lg bg-sage px-3 py-1.5 font-semibold text-white"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingVariant(null)}
                                  className="rounded-lg border border-wheat px-2.5 py-1.5 text-cocoa"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center gap-2.5">
                                  <span className="font-semibold text-espresso">
                                    {variant.label}
                                  </span>
                                  <span className="rounded bg-parchment px-2 py-0.5 text-[11px] font-medium text-cocoa">
                                    {variant.priceDeltaCents >= 0 ? '+' : ''}
                                    {formatMoney(variant.priceDeltaCents)}
                                  </span>
                                  <span className="font-bold text-espresso">
                                    = {formatMoney(finalCents)}
                                  </span>
                                </div>

                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() =>
                                      handleToggleVariantActive(product.id, variant)
                                    }
                                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                                      variant.isActive
                                        ? 'bg-sage/15 text-sage'
                                        : 'bg-stone-200 text-stone-600'
                                    }`}
                                  >
                                    {variant.isActive ? 'Active' : 'Hidden'}
                                  </button>
                                  <button
                                    onClick={() =>
                                      setEditingVariant({
                                        productId: product.id,
                                        variantId: variant.id,
                                        label: variant.label,
                                        deltaDollars: centsToDollarsInput(
                                          variant.priceDeltaCents
                                        ),
                                      })
                                    }
                                    className="rounded-lg border border-wheat px-2.5 py-1 font-semibold text-espresso hover:border-espresso"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    disabled={
                                      product.variants.length <= 1 ||
                                      busyKey === `var-del-${variant.id}`
                                    }
                                    onClick={() =>
                                      handleDeleteVariant(product.id, variant)
                                    }
                                    title={
                                      product.variants.length <= 1
                                        ? 'At least 1 variant required'
                                        : 'Remove variant'
                                    }
                                    className="rounded-lg border border-red-200 p-1 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Add New Variant Row */}
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-terracotta/50 bg-white/80 p-2.5">
                      <input
                        type="text"
                        placeholder='New variant label (e.g., "8-inch Gluten-Free" or "Box of 6")'
                        value={draft.label}
                        onChange={(e) =>
                          setNewVariantDraft((prev) => ({
                            ...prev,
                            [product.id]: { ...draft, label: e.target.value },
                          }))
                        }
                        className="min-w-[220px] flex-1 rounded-lg border border-wheat bg-cream/60 px-3 py-1.5 text-xs focus:border-terracotta focus:outline-none"
                      />
                      <div className="flex items-center gap-1 text-xs">
                        <span className="font-semibold text-cocoa">Delta $</span>
                        <input
                          type="number"
                          step="0.25"
                          value={draft.deltaDollars}
                          onChange={(e) =>
                            setNewVariantDraft((prev) => ({
                              ...prev,
                              [product.id]: {
                                ...draft,
                                deltaDollars: e.target.value,
                              },
                            }))
                          }
                          className="w-24 rounded-lg border border-wheat bg-cream/60 px-2.5 py-1.5 text-xs"
                        />
                      </div>
                      <button
                        type="button"
                        disabled={
                          !draft.label.trim() ||
                          busyKey === `var-add-${product.id}`
                        }
                        onClick={() => handleAddVariant(product.id)}
                        className="inline-flex items-center gap-1 rounded-lg bg-terracotta px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-terracotta-dark disabled:opacity-50"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add Variant
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Create / Edit Product Modal */}
      {modalMode !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-espresso/55 p-4 backdrop-blur-xs">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-wheat bg-cream p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-wheat pb-4">
              <div>
                <h2 className="font-serif text-2xl font-bold text-espresso">
                  {modalMode === 'create'
                    ? 'Create New Menu Item'
                    : `Edit ${modalMode.name}`}
                </h2>
                <p className="text-xs text-cocoa">
                  Updates storefront menu &amp; invalidates Redis catalog cache.
                </p>
              </div>
              <button
                onClick={() => setModalMode(null)}
                className="rounded-full p-2 text-cocoa hover:bg-parchment"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-cocoa">
                    Product Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g., Hazelnut Praline Paris-Brest"
                    className="mt-1 w-full rounded-xl border border-wheat bg-white px-3.5 py-2 text-sm text-espresso"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-cocoa">
                    Category *
                  </label>
                  <input
                    type="text"
                    required
                    list="backeri-categories"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-wheat bg-white px-3.5 py-2 text-sm text-espresso"
                  />
                  <datalist id="backeri-categories">
                    {Array.from(new Set([...PRESET_CATEGORIES, ...categories])).map(
                      (c) => (
                        <option key={c} value={c} />
                      )
                    )}
                  </datalist>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-cocoa">
                  Description *
                </label>
                <textarea
                  rows={2}
                  required
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  placeholder="Describe flavor profile, ingredients, and serving size..."
                  className="mt-1 w-full rounded-xl border border-wheat bg-white px-3.5 py-2 text-sm text-espresso"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-cocoa">
                    Base Price ($) *
                  </label>
                  <input
                    type="number"
                    step="0.25"
                    min="0.50"
                    required
                    value={form.basePriceDollars}
                    onChange={(e) =>
                      setForm({ ...form, basePriceDollars: e.target.value })
                    }
                    className="mt-1 w-full rounded-xl border border-wheat bg-white px-3.5 py-2 text-sm text-espresso"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-cocoa">
                    Lead Time (Hours) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="168"
                    required
                    value={form.leadTimeHours}
                    onChange={(e) =>
                      setForm({ ...form, leadTimeHours: e.target.value })
                    }
                    className="mt-1 w-full rounded-xl border border-wheat bg-white px-3.5 py-2 text-sm text-espresso"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-cocoa">
                    Storefront Status
                  </label>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, isActive: !form.isActive })}
                    className={`mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-bold ${
                      form.isActive
                        ? 'border-sage bg-sage/15 text-sage'
                        : 'border-red-200 bg-red-50 text-red-700'
                    }`}
                  >
                    {form.isActive ? 'Active (In Stock)' : 'Sold Out (Hidden)'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-cocoa">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={form.tagsText}
                  onChange={(e) => setForm({ ...form, tagsText: e.target.value })}
                  placeholder="Eggless Available, 24h Notice, Seasonal"
                  className="mt-1 w-full rounded-xl border border-wheat bg-white px-3.5 py-2 text-sm text-espresso"
                />
              </div>

              {/* Image Picker + Pre-signed Upload */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-cocoa">
                    Product Image
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-terracotta hover:underline">
                    {uploadingImage ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ImagePlus className="h-3.5 w-3.5" />
                    )}
                    <span>{uploadingImage ? 'Uploading...' : 'Upload Photo'}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      disabled={uploadingImage}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleImageUpload(f);
                      }}
                    />
                  </label>
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {PRESET_IMAGES.map((img) => (
                    <button
                      key={img.url}
                      type="button"
                      onClick={() => setForm({ ...form, imageUrl: img.url })}
                      className={`overflow-hidden rounded-xl border-2 p-0.5 transition ${
                        form.imageUrl === img.url
                          ? 'border-terracotta ring-1 ring-terracotta'
                          : 'border-wheat opacity-75 hover:opacity-100'
                      }`}
                      title={img.label}
                    >
                      <img
                        src={img.url}
                        alt={img.label}
                        className="h-10 w-12 rounded-lg object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>

              {/* Initial Variants Builder (Create Mode) */}
              {modalMode === 'create' && (
                <div className="rounded-2xl border border-wheat bg-white p-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-espresso">
                      Initial Variants *
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          variants: [
                            ...prev.variants,
                            { label: '', priceDeltaDollars: '0.00' },
                          ],
                        }))
                      }
                      className="inline-flex items-center gap-1 text-xs font-semibold text-terracotta hover:underline"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Row
                    </button>
                  </div>

                  <div className="mt-3 space-y-2">
                    {form.variants.map((v, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          required
                          placeholder='e.g., "6-inch", "8-inch Eggless", "Box of 4"'
                          value={v.label}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              variants: prev.variants.map((item, i) =>
                                i === idx
                                  ? { ...item, label: e.target.value }
                                  : item
                              ),
                            }))
                          }
                          className="flex-1 rounded-xl border border-wheat bg-cream/60 px-3 py-2 text-xs"
                        />
                        <div className="flex items-center gap-1 text-xs">
                          <span className="text-cocoa">+$</span>
                          <input
                            type="number"
                            step="0.25"
                            value={v.priceDeltaDollars}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                variants: prev.variants.map((item, i) =>
                                  i === idx
                                    ? { ...item, priceDeltaDollars: e.target.value }
                                    : item
                                ),
                              }))
                            }
                            className="w-24 rounded-xl border border-wheat bg-cream/60 px-2.5 py-2 text-xs"
                          />
                        </div>
                        {form.variants.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setForm((prev) => ({
                                ...prev,
                                variants: prev.variants.filter((_, i) => i !== idx),
                              }))
                            }
                            className="rounded-lg p-1.5 text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {formError && (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-medium text-red-700">
                  {formError}
                </p>
              )}

              <div className="flex items-center justify-end gap-3 border-t border-wheat pt-4">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="rounded-xl border border-wheat bg-white px-4 py-2.5 text-xs font-semibold text-cocoa hover:border-espresso"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingProduct}
                  className="inline-flex items-center gap-2 rounded-xl bg-terracotta px-5 py-2.5 text-xs font-semibold text-white hover:bg-terracotta-dark disabled:opacity-60"
                >
                  {savingProduct && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {modalMode === 'create' ? 'Create Product' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
