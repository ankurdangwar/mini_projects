'use client';

import { useEffect, useState } from 'react';
import { Calendar, ClipboardList, Printer, RefreshCw } from 'lucide-react';
import { formatSlotWindow } from '@backeri/shared';
import { apiFetch } from '@/lib/api';
import type { PrepSheetResponse } from '@/lib/types';

function isoDateWithOffset(days: number): string {
  const now = new Date();
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days)
  );
  return d.toISOString().slice(0, 10);
}

export default function PrepSheetPage() {
  const [date, setDate] = useState(() => isoDateWithOffset(1)); // Default to tomorrow's bake
  const [sheet, setSheet] = useState<PrepSheetResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSheet = (targetDate: string) => {
    setLoading(true);
    apiFetch<PrepSheetResponse>(`/api/v1/admin/prep-sheet?date=${targetDate}`)
      .then((res) => setSheet(res))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSheet(date);
  }, [date]);

  return (
    <div>
      <div className="no-print flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-espresso">
            Daily Prep Sheet (Production View)
          </h1>
          <p className="mt-0.5 text-xs text-cocoa">
            Aggregated quantities grouped by product &amp; variant for all active
            orders (<code>PAID</code>, <code>BAKING</code>, <code>READY</code>)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setDate(isoDateWithOffset(0))}
            className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${
              date === isoDateWithOffset(0)
                ? 'border-espresso bg-espresso text-cream'
                : 'border-wheat bg-white text-cocoa'
            }`}
          >
            Today
          </button>
          <button
            onClick={() => setDate(isoDateWithOffset(1))}
            className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${
              date === isoDateWithOffset(1)
                ? 'border-espresso bg-espresso text-cream'
                : 'border-wheat bg-white text-cocoa'
            }`}
          >
            Tomorrow
          </button>

          <div className="flex items-center gap-1.5 rounded-xl border border-wheat bg-white px-3 py-1.5 text-xs">
            <Calendar className="h-3.5 w-3.5 text-terracotta" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent font-semibold text-espresso focus:outline-none"
            />
          </div>

          <button
            onClick={() => loadSheet(date)}
            className="inline-flex items-center gap-1 rounded-xl border border-wheat bg-white px-3 py-1.5 text-xs font-semibold text-cocoa hover:border-espresso"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>

          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-terracotta px-4 py-1.5 text-xs font-semibold text-white hover:bg-terracotta-dark"
          >
            <Printer className="h-3.5 w-3.5" />
            Print Kitchen Sheet
          </button>
        </div>
      </div>

      {/* Print Header */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-wheat bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-cocoa">
            Bake Date
          </p>
          <p className="mt-1 font-serif text-2xl font-bold text-espresso">{date}</p>
        </div>
        <div className="rounded-2xl border border-wheat bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-cocoa">
            Total Units to Bake
          </p>
          <p className="mt-1 font-serif text-2xl font-bold text-terracotta">
            {sheet?.totalUnits ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-wheat bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-cocoa">
            Distinct SKUs / Variants
          </p>
          <p className="mt-1 font-serif text-2xl font-bold text-espresso">
            {sheet?.distinctVariants ?? 0}
          </p>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-wheat bg-white shadow-xs">
        {loading ? (
          <div className="p-10 text-center text-sm text-cocoa">
            Aggregating production sheet...
          </div>
        ) : !sheet || sheet.items.length === 0 ? (
          <div className="p-12 text-center">
            <ClipboardList className="mx-auto h-10 w-10 text-wheat" />
            <p className="mt-3 font-serif text-lg font-bold text-espresso">
              No active bake requirements for {date}
            </p>
            <p className="mt-1 text-xs text-cocoa">
              Confirmed paid orders scheduled for this date will automatically appear
              grouped here.
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-wheat bg-parchment/80 text-xs uppercase tracking-wider text-cocoa">
              <tr>
                <th className="px-5 py-3.5">Category</th>
                <th className="px-5 py-3.5">Product &amp; Variant</th>
                <th className="px-5 py-3.5 text-center">Total Qty</th>
                <th className="px-5 py-3.5 text-center">Tickets</th>
                <th className="px-5 py-3.5">Breakdown by Slot Window</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-wheat/70">
              {sheet.items.map((row) => (
                <tr key={row.variantId} className="hover:bg-cream/60">
                  <td className="px-5 py-4 text-xs font-semibold uppercase tracking-wider text-terracotta">
                    {row.category}
                  </td>
                  <td className="px-5 py-4">
                    <p className="font-serif font-bold text-espresso">
                      {row.productName}
                    </p>
                    <p className="text-xs text-cocoa">{row.variantLabel}</p>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <span className="inline-flex min-w-[44px] items-center justify-center rounded-xl bg-espresso px-3 py-1 font-serif text-lg font-bold text-cream">
                      {row.totalQuantity}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-center text-xs font-semibold text-cocoa">
                    {row.orderCount} {row.orderCount === 1 ? 'order' : 'orders'}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      {row.slotBreakdown.map((sb) => (
                        <span
                          key={`${row.variantId}-${sb.startTime}`}
                          className="rounded-lg border border-wheat bg-parchment/70 px-2.5 py-1 text-xs font-semibold text-espresso"
                        >
                          {formatSlotWindow(sb.startTime, sb.endTime)}:{' '}
                          <strong className="text-terracotta">×{sb.quantity}</strong>
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
