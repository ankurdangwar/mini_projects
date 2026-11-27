'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Cpu,
  Play,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';

interface JobsStatusResponse {
  workersActive: boolean;
  queues: Array<{
    name: string;
    counts: Record<string, number>;
  }>;
  schedulers: Array<{
    id: string;
    name: string;
    pattern: string | null;
    everyMs: number | null;
    nextRunAt: string | null;
  }>;
  recentJobs: Array<{
    id: string;
    queue: string;
    name: string;
    status: string;
    attemptsMade: number;
    result: unknown;
    failedReason: string | null;
    timestamp: string;
    finishedOn: string | null;
  }>;
}

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-sage/15 text-sage',
  active: 'bg-blue-100 text-blue-800',
  waiting: 'bg-amber-100 text-amber-800',
  delayed: 'bg-purple-100 text-purple-800',
  failed: 'bg-red-100 text-red-700',
};

export default function AdminJobsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<JobsStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [flashMsg, setFlashMsg] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await apiFetch<JobsStatusResponse>('/api/v1/admin/jobs');
      setData(res);
    } catch (err) {
      console.error('Failed to load BullMQ job status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role !== 'ADMIN') {
      setLoading(false);
      return;
    }
    loadStatus();
    const timer = setInterval(loadStatus, 5000);
    return () => clearInterval(timer);
  }, [user, loadStatus]);

  if (user?.role !== 'ADMIN') {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-amber-700" />
        <h1 className="mt-3 font-serif text-2xl font-bold text-espresso">
          Admin Access Required
        </h1>
        <p className="mt-1 text-sm text-cocoa">
          BullMQ queue inspection and manual maintenance triggers are restricted to
          the <strong>ADMIN</strong> role.
        </p>
      </div>
    );
  }

  const triggerJob = async (
    endpoint: string,
    label: string,
    body?: Record<string, unknown>
  ) => {
    setBusyAction(endpoint);
    try {
      const res = await apiFetch<{ jobId: string }>(endpoint, {
        method: 'POST',
        body: JSON.stringify(body ?? {}),
      });
      setFlashMsg(`${label} queued (Job #${res.jobId}).`);
      setTimeout(() => setFlashMsg(null), 4000);
      setTimeout(loadStatus, 600);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to enqueue job');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-espresso">
            Background Jobs &amp; Queues (BullMQ)
          </h1>
          <p className="mt-0.5 text-xs text-cocoa">
            Redis-backed async notification dispatch, nightly rolling slot generation,
            and stale <code>PENDING</code> order cleanup.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            disabled={busyAction !== null}
            onClick={() =>
              triggerJob('/api/v1/admin/jobs/rolling-slots', 'Rolling Slot Generator', {
                daysAhead: 14,
              })
            }
            className="inline-flex items-center gap-1.5 rounded-xl bg-terracotta px-3.5 py-2 text-xs font-semibold text-white hover:bg-terracotta-dark disabled:opacity-50"
          >
            <CalendarPlus className="h-3.5 w-3.5" />
            Generate 14d Slots Now
          </button>

          <button
            disabled={busyAction !== null}
            onClick={() =>
              triggerJob(
                '/api/v1/admin/jobs/cleanup-pending',
                'Stale PENDING Order Cleanup',
                { olderThanMinutes: 20 }
              )
            }
            className="inline-flex items-center gap-1.5 rounded-xl border border-wheat bg-white px-3.5 py-2 text-xs font-semibold text-espresso hover:border-espresso disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5 text-terracotta" />
            Clean Stale Orders Now
          </button>

          <button
            onClick={loadStatus}
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

      {loading || !data ? (
        <p className="text-sm text-cocoa">Loading BullMQ queue telemetry...</p>
      ) : (
        <>
          {/* Queue Cards */}
          <div className="grid gap-4 md:grid-cols-2">
            {data.queues.map((q) => (
              <section
                key={q.name}
                className="rounded-2xl border border-wheat bg-white p-5 shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-terracotta" />
                    <h2 className="font-serif text-lg font-bold text-espresso">
                      {q.name}
                    </h2>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                      data.workersActive
                        ? 'bg-sage/15 text-sage'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {data.workersActive ? 'Worker Online' : 'Idle'}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-5 gap-2 text-center">
                  {(['waiting', 'active', 'completed', 'failed', 'delayed'] as const).map(
                    (metric) => (
                      <div
                        key={metric}
                        className="rounded-xl border border-wheat/70 bg-cream/60 py-2.5"
                      >
                        <p className="font-serif text-xl font-bold text-espresso">
                          {q.counts[metric] ?? 0}
                        </p>
                        <p className="text-[10px] font-semibold uppercase text-cocoa">
                          {metric}
                        </p>
                      </div>
                    )
                  )}
                </div>
              </section>
            ))}
          </div>

          {/* Recurring Schedulers */}
          <section className="rounded-2xl border border-wheat bg-white p-6 shadow-xs">
            <h2 className="font-serif text-lg font-bold text-espresso">
              Active Recurring Schedules
            </h2>
            {data.schedulers.length === 0 ? (
              <p className="mt-2 text-xs text-cocoa">
                No recurring schedulers registered yet.
              </p>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {data.schedulers.map((sched) => (
                  <div
                    key={sched.id}
                    className="flex items-center justify-between rounded-xl border border-wheat bg-cream/50 p-4"
                  >
                    <div>
                      <p className="font-semibold text-espresso text-sm">
                        {sched.name}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-cocoa">
                        <Clock className="h-3.5 w-3.5 text-terracotta" />
                        {sched.pattern
                          ? `Cron: ${sched.pattern} (UTC)`
                          : sched.everyMs
                            ? `Every ${Math.round(sched.everyMs / 60000)} minutes`
                            : 'Scheduled'}
                      </p>
                      {sched.nextRunAt && (
                        <p className="mt-0.5 text-[11px] text-cocoa/80">
                          Next run: {new Date(sched.nextRunAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <Play className="h-4 w-4 text-sage" />
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Recent Job Executions */}
          <section className="rounded-2xl border border-wheat bg-white p-6 shadow-xs">
            <h2 className="font-serif text-lg font-bold text-espresso">
              Recent Job Runs
            </h2>
            {data.recentJobs.length === 0 ? (
              <p className="mt-3 text-xs text-cocoa">
                No recent jobs recorded yet. Trigger a maintenance job or place an
                order to watch BullMQ jobs execute here.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-wheat text-cocoa uppercase">
                    <tr>
                      <th className="py-2 pr-4">Job</th>
                      <th className="py-2 pr-4">Queue</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Attempts</th>
                      <th className="py-2 pr-4">Result / Error</th>
                      <th className="py-2">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-wheat/60">
                    {data.recentJobs.map((job) => (
                      <tr key={`${job.queue}-${job.id}`}>
                        <td className="py-2.5 pr-4 font-semibold text-espresso">
                          {job.name}
                        </td>
                        <td className="py-2.5 pr-4 font-mono text-[11px] text-cocoa">
                          {job.queue}
                        </td>
                        <td className="py-2.5 pr-4">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                              STATUS_COLORS[job.status] ??
                              'bg-parchment text-cocoa'
                            }`}
                          >
                            {job.status}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 text-cocoa">
                          {job.attemptsMade}
                        </td>
                        <td className="max-w-xs truncate py-2.5 pr-4 font-mono text-[11px] text-cocoa">
                          {job.failedReason
                            ? job.failedReason
                            : job.result
                              ? JSON.stringify(job.result)
                              : '—'}
                        </td>
                        <td className="py-2.5 text-cocoa whitespace-nowrap">
                          {new Date(job.timestamp).toLocaleTimeString()}
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
