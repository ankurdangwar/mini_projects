'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  DollarSign,
  Mail,
  MessageSquare,
  ShoppingBag,
  TrendingUp,
} from 'lucide-react';
import { formatMoney, formatSlotWindow } from '@backeri/shared';
import { apiFetch } from '@/lib/api';
import type { AnalyticsResponse, NotificationLogDTO } from '@/lib/types';
import { useAuth } from '@/components/AuthProvider';

export default function AdminAnalyticsPage() {
  const { user } = useAuth();
  const [days, setDays] = useState(14);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [notifications, setNotifications] = useState<NotificationLogDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user?.role !== 'ADMIN') {
      setLoading(false);
      return;
    }

    setLoading(true);
    Promise.all([
      apiFetch<AnalyticsResponse>(`/api/v1/admin/analytics?days=${days}`),
      apiFetch<{ notifications: NotificationLogDTO[] }>(
        '/api/v1/admin/notifications?limit=25'
      ),
    ])
      .then(([a, n]) => {
        setAnalytics(a);
        setNotifications(n.notifications);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Failed to load analytics')
      )
      .finally(() => setLoading(false));
  }, [days, user]);

  if (user?.role !== 'ADMIN') {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-amber-700" />
        <h1 className="mt-3 font-serif text-2xl font-bold text-espresso">
          Admin Access Required
        </h1>
        <p className="mt-1 text-sm text-cocoa">
          Revenue analytics and notification logs are restricted to the{' '}
          <strong>ADMIN</strong> role. Bakers have access to the Live Order Board, Daily
          Prep Sheet, and Sold-Out controls.
        </p>
      </div>
    );
  }

  const maxProductUnits = Math.max(
    1,
    ...(analytics?.topProducts.map((p) => p.unitsSold) ?? [1])
  );
  const maxPeakOrders = Math.max(
    1,
    ...(analytics?.peakWindows.map((w) => w.orderCount) ?? [1])
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-espresso">
            Sales, Waste Analytics &amp; Notification Log
          </h1>
          <p className="mt-0.5 text-xs text-cocoa">
            Admin-only revenue metrics, top bakes, peak pickup windows, and SMS/Email audit
            log.
          </p>
        </div>

        <div className="flex gap-2">
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-xl border px-3.5 py-1.5 text-xs font-semibold ${
                days === d
                  ? 'border-espresso bg-espresso text-cream'
                  : 'border-wheat bg-white text-cocoa'
              }`}
            >
              Last {d}d
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700">
          {error}
        </div>
      )}

      {loading || !analytics ? (
        <p className="text-sm text-cocoa">Loading bakery analytics...</p>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-wheat bg-white p-5">
              <div className="flex items-center justify-between text-xs font-semibold text-cocoa">
                <span>Confirmed Revenue</span>
                <DollarSign className="h-4 w-4 text-sage" />
              </div>
              <p className="mt-2 font-serif text-3xl font-bold text-espresso">
                {formatMoney(analytics.summary.totalRevenueCents)}
              </p>
            </div>

            <div className="rounded-2xl border border-wheat bg-white p-5">
              <div className="flex items-center justify-between text-xs font-semibold text-cocoa">
                <span>Paid Orders</span>
                <ShoppingBag className="h-4 w-4 text-terracotta" />
              </div>
              <p className="mt-2 font-serif text-3xl font-bold text-espresso">
                {analytics.summary.paidOrderCount}
              </p>
            </div>

            <div className="rounded-2xl border border-wheat bg-white p-5">
              <div className="flex items-center justify-between text-xs font-semibold text-cocoa">
                <span>Average Order Value (AOV)</span>
                <TrendingUp className="h-4 w-4 text-sage" />
              </div>
              <p className="mt-2 font-serif text-3xl font-bold text-espresso">
                {formatMoney(analytics.summary.averageOrderValueCents)}
              </p>
            </div>

            <div className="rounded-2xl border border-wheat bg-white p-5">
              <div className="flex items-center justify-between text-xs font-semibold text-cocoa">
                <span>Production Waste Rate</span>
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              </div>
              <p className="mt-2 font-serif text-3xl font-bold text-espresso">
                {analytics.wasteSummary.productionWasteRatePct}%
              </p>
              <p className="text-[11px] text-cocoa">
                {analytics.wasteSummary.totalWastedUnits} wasted units (
                {formatMoney(analytics.wasteSummary.estimatedWasteValueCents)}) •{' '}
                {analytics.summary.cancellationRatePct}% order cancellations
              </p>
            </div>
          </div>

          {/* Production vs Waste Breakdown */}
          <section className="rounded-2xl border border-wheat bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-serif text-lg font-bold text-espresso">
                  Production vs. End-of-Day Bakery Waste
                </h2>
                <p className="text-xs text-cocoa">
                  Sold: <strong>{analytics.wasteSummary.totalSoldUnits}</strong> units vs.
                  Logged Waste: <strong>{analytics.wasteSummary.totalWastedUnits}</strong>{' '}
                  units ({formatMoney(analytics.wasteSummary.estimatedWasteValueCents)}{' '}
                  estimated value)
                </p>
              </div>
            </div>

            {analytics.wasteSummary.totalWastedUnits === 0 ? (
              <p className="mt-4 text-xs text-cocoa">
                No end-of-day waste logged in this window. Staff can record unsold or
                damaged batches on the <strong>Waste Log</strong> page.
              </p>
            ) : (
              <div className="mt-4 grid gap-6 md:grid-cols-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-cocoa">
                    Waste by Reason
                  </p>
                  <div className="mt-2.5 space-y-2.5">
                    {analytics.wasteSummary.byReason.map((r) => (
                      <div key={r.reason} className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-espresso">{r.reason}</span>
                        <span className="text-cocoa">
                          {r.units} units • {formatMoney(r.valueCents)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-cocoa">
                    Most Frequently Wasted Items
                  </p>
                  <div className="mt-2.5 space-y-2.5">
                    {analytics.wasteSummary.topWastedProducts.map((w) => (
                      <div
                        key={`${w.productId}-${w.variantLabel}`}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="font-semibold text-espresso">
                          {w.productName}{' '}
                          <span className="font-normal text-cocoa">
                            ({w.variantLabel})
                          </span>
                        </span>
                        <span className="text-terracotta font-bold">
                          {w.units} units ({formatMoney(w.valueCents)})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Top Selling Products */}
            <section className="rounded-2xl border border-wheat bg-white p-6">
              <h2 className="font-serif text-lg font-bold text-espresso">
                Top-Selling Bakery Items
              </h2>
              <div className="mt-4 space-y-3">
                {analytics.topProducts.length === 0 ? (
                  <p className="text-xs text-cocoa">No sales data yet.</p>
                ) : (
                  analytics.topProducts.map((item) => (
                    <div key={item.productId}>
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-espresso">{item.productName}</span>
                        <span className="text-cocoa">
                          {item.unitsSold} units • {formatMoney(item.revenueCents)}
                        </span>
                      </div>
                      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-parchment">
                        <div
                          className="h-full rounded-full bg-terracotta"
                          style={{
                            width: `${Math.round(
                              (item.unitsSold / maxProductUnits) * 100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Peak Pickup Windows */}
            <section className="rounded-2xl border border-wheat bg-white p-6">
              <h2 className="font-serif text-lg font-bold text-espresso">
                Peak Pickup &amp; Delivery Windows
              </h2>
              <div className="mt-4 space-y-3">
                {analytics.peakWindows.length === 0 ? (
                  <p className="text-xs text-cocoa">No slot booking data yet.</p>
                ) : (
                  analytics.peakWindows.map((win) => (
                    <div key={win.startTime}>
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-espresso">
                          {formatSlotWindow(win.startTime, win.endTime)}
                        </span>
                        <span className="text-cocoa">{win.orderCount} orders</span>
                      </div>
                      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-parchment">
                        <div
                          className="h-full rounded-full bg-sage"
                          style={{
                            width: `${Math.round(
                              (win.orderCount / maxPeakOrders) * 100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          {/* Dispatched Notifications Audit Log */}
          <section className="rounded-2xl border border-wheat bg-white p-6">
            <h2 className="font-serif text-lg font-bold text-espresso">
              Recent Customer Notifications (Sandbox SMS &amp; Email Log)
            </h2>
            <p className="mt-0.5 text-xs text-cocoa">
              Every confirmation and &ldquo;Ready for Pickup&rdquo; alert dispatched by the
              notification service.
            </p>

            {notifications.length === 0 ? (
              <p className="mt-4 text-xs text-cocoa">
                No notifications dispatched yet. Place an order or mark an order READY on
                the Kanban board to see live SMS/Email logs here.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-wheat text-cocoa uppercase">
                    <tr>
                      <th className="py-2 pr-4">Channel</th>
                      <th className="py-2 pr-4">Order</th>
                      <th className="py-2 pr-4">Recipient</th>
                      <th className="py-2 pr-4">Message</th>
                      <th className="py-2">Sent At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-wheat/60">
                    {notifications.map((n) => (
                      <tr key={n.id}>
                        <td className="py-2.5 pr-4">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold ${
                              n.channel === 'SMS'
                                ? 'bg-sage/15 text-sage'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {n.channel === 'SMS' ? (
                              <MessageSquare className="h-3 w-3" />
                            ) : (
                              <Mail className="h-3 w-3" />
                            )}
                            {n.channel}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 font-bold text-espresso">
                          {n.order?.orderNumber ?? '—'}
                        </td>
                        <td className="py-2.5 pr-4 text-cocoa">{n.recipient}</td>
                        <td className="py-2.5 pr-4 text-espresso">
                          {n.subject && (
                            <span className="font-semibold">{n.subject}: </span>
                          )}
                          {n.body}
                        </td>
                        <td className="py-2.5 text-cocoa whitespace-nowrap">
                          {new Date(n.createdAt).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
