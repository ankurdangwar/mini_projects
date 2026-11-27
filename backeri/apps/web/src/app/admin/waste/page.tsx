'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  PlusCircle,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { formatMoney, WasteReasons, type WasteReason } from '@backeri/shared';
import { apiFetch } from '@/lib/api';
import type { MenuResponse, ProductDTO, WasteLogDTO } from '@/lib/types';
import { useAuth } from '@/components/AuthProvider';

const REASON_LABELS: Record<WasteReason, string> = {
  UNSOLD: 'Unsold EOD',
  DAMAGED: 'Damaged / Crushed',
  BURNT: 'Overbaked / Burnt',
  EXPIRED: 'Expired',
  OTHER: 'Other',
};

const REASON_BADGE: Record<WasteReason, string> = {
  UNSOLD: 'bg-amber-100 text-amber-900',
  DAMAGED: 'bg-orange-100 text-orange-900',
  BURNT: 'bg-red-100 text-red-800',
  EXPIRED: 'bg-stone-200 text-stone-700',
  OTHER: 'bg-parchment text-cocoa',
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function WasteLogPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState<ProductDTO[]>([]);
  const [logs, setLogs] = useState<WasteLogDTO[]>([]);
  const [summary, setSummary] = useState({
    entryCount: 0,
    totalUnits: 0,
    totalValueCents: 0,
  });
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState('');

  // Quick-log form
  const [date, setDate] = useState(todayIso);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [quantity, setQuantity] = useState('2');
  const [reason, setReason] = useState<WasteReason>('UNSOLD');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [flashMsg, setFlashMsg] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = filterDate ? `?date=${filterDate}` : '?days=14';
      const [menuRes, wasteRes] = await Promise.all([
        apiFetch<MenuResponse>('/api/v1/admin/products'),
        apiFetch<{
          logs: WasteLogDTO[];
          summary: { entryCount: number; totalUnits: number; totalValueCents: number };
        }>(`/api/v1/admin/waste${qs}`),
      ]);

      setProducts(menuRes.products);
      setLogs(wasteRes.logs);
      setSummary(wasteRes.summary);

      if (!selectedProductId && menuRes.products.length > 0) {
        const first = menuRes.products[0];
        setSelectedProductId(first.id);
        setSelectedVariantId(first.variants[0]?.id ?? '');
      }
    } catch (err) {
      console.error('Failed to load waste logs:', err);
    } finally {
      setLoading(false);
    }
  }, [filterDate, selectedProductId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const currentProduct = products.find((p) => p.id === selectedProductId);

  const handleProductChange = (prodId: string) => {
    setSelectedProductId(prodId);
    const prod = products.find((p) => p.id === prodId);
    setSelectedVariantId(prod?.variants[0]?.id ?? '');
  };

  const handleLogWaste = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVariantId) return;

    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) return;

    setSubmitting(true);
    try {
      await apiFetch('/api/v1/admin/waste', {
        method: 'POST',
        body: JSON.stringify({
          date,
          variantId: selectedVariantId,
          quantity: qty,
          reason,
          notes: notes.trim() || undefined,
        }),
      });
      setNotes('');
      setQuantity('1');
      setFlashMsg('End-of-day waste logged and synced with Analytics.');
      setTimeout(() => setFlashMsg(null), 4000);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to record waste');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this waste log entry?')) return;
    try {
      await apiFetch(`/api/v1/admin/waste/${id}`, { method: 'DELETE' });
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-espresso">
            End-of-Day Bakery Waste Log
          </h1>
          <p className="mt-0.5 text-xs text-cocoa">
            Record unsold loaves, pastries, or baking losses so production planning
            can optimize daily batch sizes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-xl border border-wheat bg-white px-3 py-1.5 text-xs">
            <Calendar className="h-3.5 w-3.5 text-terracotta" />
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="bg-transparent font-semibold text-espresso focus:outline-none"
            />
            {filterDate && (
              <button
                onClick={() => setFilterDate('')}
                className="ml-1 text-[11px] font-bold text-terracotta"
              >
                Clear
              </button>
            )}
          </div>
          <button
            onClick={loadData}
            className="inline-flex items-center gap-1.5 rounded-xl bg-espresso px-3.5 py-2 text-xs font-semibold text-cream hover:bg-terracotta"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {flashMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-sage/40 bg-sage/15 px-4 py-2.5 text-xs font-semibold text-espresso">
          <CheckCircle2 className="h-4 w-4 text-sage" />
          <span>{flashMsg}</span>
        </div>
      )}

      {/* Summary Strip */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-wheat bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-cocoa">
            Logged Units ({filterDate || 'Last 14d'})
          </p>
          <p className="mt-1 font-serif text-3xl font-bold text-terracotta">
            {summary.totalUnits}
          </p>
        </div>
        <div className="rounded-2xl border border-wheat bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-cocoa">
            Estimated Retail Value Lost
          </p>
          <p className="mt-1 font-serif text-3xl font-bold text-espresso">
            {formatMoney(summary.totalValueCents)}
          </p>
        </div>
        <div className="rounded-2xl border border-wheat bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-cocoa">
            Entries Recorded
          </p>
          <p className="mt-1 font-serif text-3xl font-bold text-espresso">
            {summary.entryCount}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Baker Quick-Log Form */}
        <section className="rounded-2xl border border-wheat bg-white p-6 shadow-xs lg:col-span-5">
          <h2 className="font-serif text-xl font-bold text-espresso">
            Quick-Log Unsold / Spoiled Batch
          </h2>
          <form onSubmit={handleLogWaste} className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-cocoa">
                  Bake Date
                </label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-wheat bg-cream/60 px-3 py-2 text-sm text-espresso"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-cocoa">
                  Quantity *
                </label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-wheat bg-cream/60 px-3 py-2 text-sm text-espresso"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-cocoa">
                Product
              </label>
              <select
                value={selectedProductId}
                onChange={(e) => handleProductChange(e.target.value)}
                className="mt-1 w-full rounded-xl border border-wheat bg-cream/60 px-3 py-2.5 text-sm text-espresso"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.category})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-cocoa">
                Variant
              </label>
              <select
                value={selectedVariantId}
                onChange={(e) => setSelectedVariantId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-wheat bg-cream/60 px-3 py-2.5 text-sm text-espresso"
              >
                {(currentProduct?.variants ?? []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label} (
                    {formatMoney(
                      (currentProduct?.basePriceCents ?? 0) + v.priceDeltaCents
                    )}
                    )
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-cocoa">
                Reason
              </label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {WasteReasons.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      reason === r
                        ? 'bg-espresso text-cream'
                        : 'border border-wheat bg-cream/60 text-cocoa hover:border-terracotta'
                    }`}
                  >
                    {REASON_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-cocoa">
                Notes (Optional)
              </label>
              <input
                type="text"
                maxLength={250}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., Rainy afternoon walk-in slowdown, donated to shelter"
                className="mt-1 w-full rounded-xl border border-wheat bg-cream/60 px-3 py-2 text-sm text-espresso"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !selectedVariantId}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-terracotta py-3 text-sm font-semibold text-white hover:bg-terracotta-dark disabled:opacity-50"
            >
              <PlusCircle className="h-4 w-4" />
              {submitting ? 'Recording...' : 'Log End-of-Day Waste'}
            </button>
          </form>
        </section>

        {/* Waste History Table */}
        <section className="rounded-2xl border border-wheat bg-white p-6 shadow-xs lg:col-span-7">
          <h2 className="font-serif text-xl font-bold text-espresso">
            Recorded Waste History
          </h2>

          {loading ? (
            <p className="mt-4 text-xs text-cocoa">Loading waste logs...</p>
          ) : logs.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-wheat bg-cream/50 p-10 text-center text-xs text-cocoa">
              No waste entries recorded for this period. Great batch accuracy!
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-wheat text-cocoa uppercase">
                  <tr>
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Item</th>
                    <th className="py-2 pr-3 text-center">Qty</th>
                    <th className="py-2 pr-3">Reason</th>
                    <th className="py-2 pr-3 text-right">Value</th>
                    <th className="py-2 pr-3">Logged By</th>
                    {user?.role === 'ADMIN' && <th className="py-2" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-wheat/60">
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td className="py-3 pr-3 font-mono text-cocoa whitespace-nowrap">
                        {log.date}
                      </td>
                      <td className="py-3 pr-3">
                        <p className="font-semibold text-espresso">
                          {log.variant.product.name}
                        </p>
                        <p className="text-[11px] text-cocoa">
                          {log.variant.label}
                          {log.notes ? ` • ${log.notes}` : ''}
                        </p>
                      </td>
                      <td className="py-3 pr-3 text-center font-bold text-espresso">
                        {log.quantity}
                      </td>
                      <td className="py-3 pr-3">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                            REASON_BADGE[log.reason]
                          }`}
                        >
                          {REASON_LABELS[log.reason]}
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-right font-semibold text-espresso">
                        {formatMoney(log.totalValueCents)}
                      </td>
                      <td className="py-3 pr-3 text-cocoa">
                        {log.loggedBy.name.split(' ')[0]}
                      </td>
                      {user?.role === 'ADMIN' && (
                        <td className="py-3 text-right">
                          <button
                            onClick={() => handleDelete(log.id)}
                            title="Delete entry"
                            className="rounded p-1 text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
