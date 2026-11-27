import { Queue, Worker, type Job } from 'bullmq';
import { env } from '../../config/env';
import {
  DEFAULT_SLOT_HORIZON_DAYS,
  DEFAULT_STALE_PENDING_MINUTES,
  getBullMQConnection,
  MAINTENANCE_JOBS,
  QUEUE_NAMES,
} from './job.config';
import {
  handleRollingSlotGeneration,
  handleStalePendingCleanup,
  type NotificationJobPayload,
} from './job.handlers';

type NotificationDispatcher = (
  payload: NotificationJobPayload
) => Promise<{ dispatchedCount: number }>;

let notificationQueue: Queue<NotificationJobPayload> | null = null;
let maintenanceQueue: Queue<Record<string, unknown>> | null = null;
let notificationWorker: Worker<NotificationJobPayload> | null = null;
let maintenanceWorker: Worker<Record<string, unknown>> | null = null;
let registeredDispatcher: NotificationDispatcher | null = null;

function ensureQueues() {
  const connection = getBullMQConnection();

  if (!notificationQueue) {
    notificationQueue = new Queue<NotificationJobPayload>(
      QUEUE_NAMES.NOTIFICATIONS,
      {
        connection,
        defaultJobOptions: {
          attempts: 4,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 100 },
        },
      }
    );
  }

  if (!maintenanceQueue) {
    maintenanceQueue = new Queue<Record<string, unknown>>(
      QUEUE_NAMES.MAINTENANCE,
      {
        connection,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: { count: 50 },
          removeOnFail: { count: 50 },
        },
      }
    );
  }

  return {
    notificationQueue,
    maintenanceQueue,
  };
}

export const jobsService = {
  registerNotificationDispatcher(dispatcher: NotificationDispatcher) {
    registeredDispatcher = dispatcher;
  },

  async startWorkers(options?: { runInitialChecks?: boolean }): Promise<void> {
    const { maintenanceQueue: mQueue } = ensureQueues();
    const connection = getBullMQConnection();

    if (!notificationWorker) {
      notificationWorker = new Worker<NotificationJobPayload>(
        QUEUE_NAMES.NOTIFICATIONS,
        async (job: Job<NotificationJobPayload>) => {
          if (!registeredDispatcher) {
            throw new Error('Notification dispatcher has not been registered');
          }
          return registeredDispatcher(job.data);
        },
        {
          connection,
          concurrency: 5,
        }
      );

      notificationWorker.on('failed', (job, err) => {
        if (env.NODE_ENV !== 'test') {
          console.error(
            `[BullMQ:${QUEUE_NAMES.NOTIFICATIONS}] Job ${job?.id} failed:`,
            err.message
          );
        }
      });
    }

    if (!maintenanceWorker) {
      maintenanceWorker = new Worker<Record<string, unknown>>(
        QUEUE_NAMES.MAINTENANCE,
        async (job: Job<Record<string, unknown>>) => {
          if (job.name === MAINTENANCE_JOBS.ROLLING_SLOTS) {
            const daysAhead = Number(
              job.data?.daysAhead ?? DEFAULT_SLOT_HORIZON_DAYS
            );
            return handleRollingSlotGeneration(daysAhead);
          }

          if (job.name === MAINTENANCE_JOBS.STALE_PENDING_CLEANUP) {
            const olderThanMinutes = Number(
              job.data?.olderThanMinutes ?? DEFAULT_STALE_PENDING_MINUTES
            );
            return handleStalePendingCleanup(olderThanMinutes);
          }

          throw new Error(`Unknown maintenance job: ${job.name}`);
        },
        {
          connection,
          concurrency: 2,
        }
      );

      maintenanceWorker.on('failed', (job, err) => {
        if (env.NODE_ENV !== 'test') {
          console.error(
            `[BullMQ:${QUEUE_NAMES.MAINTENANCE}] Job ${job?.id} (${job?.name}) failed:`,
            err.message
          );
        }
      });
    }

    // Register recurring schedules (idempotent via BullMQ Job Schedulers)
    // 1. Nightly Rolling Slot Generator (00:05 UTC every night)
    await mQueue.upsertJobScheduler(
      'nightly-rolling-slots',
      { pattern: '5 0 * * *' },
      {
        name: MAINTENANCE_JOBS.ROLLING_SLOTS,
        data: { daysAhead: DEFAULT_SLOT_HORIZON_DAYS },
      }
    );

    // 2. Stale PENDING Order Cleanup (every 5 minutes)
    await mQueue.upsertJobScheduler(
      'stale-pending-order-cleanup',
      { every: 5 * 60 * 1000 },
      {
        name: MAINTENANCE_JOBS.STALE_PENDING_CLEANUP,
        data: { olderThanMinutes: DEFAULT_STALE_PENDING_MINUTES },
      }
    );

    if (options?.runInitialChecks !== false) {
      await this.triggerRollingSlotsNow(DEFAULT_SLOT_HORIZON_DAYS);
    }

    if (env.NODE_ENV !== 'test') {
      console.log(
        '[BullMQ] Workers started (notifications + nightly rolling slots + 5m stale PENDING cleanup)'
      );
    }
  },

  async enqueueNotification(payload: NotificationJobPayload) {
    const { notificationQueue: nQueue } = ensureQueues();
    const job = await nQueue.add(payload.kind, payload);
    return { jobId: job.id ?? '', queue: QUEUE_NAMES.NOTIFICATIONS };
  },

  async triggerRollingSlotsNow(daysAhead = DEFAULT_SLOT_HORIZON_DAYS) {
    const { maintenanceQueue: mQueue } = ensureQueues();
    const job = await mQueue.add(MAINTENANCE_JOBS.ROLLING_SLOTS, { daysAhead });
    return { jobId: job.id ?? '', queue: QUEUE_NAMES.MAINTENANCE, daysAhead };
  },

  async triggerStaleCleanupNow(
    olderThanMinutes = DEFAULT_STALE_PENDING_MINUTES
  ) {
    const { maintenanceQueue: mQueue } = ensureQueues();
    const job = await mQueue.add(MAINTENANCE_JOBS.STALE_PENDING_CLEANUP, {
      olderThanMinutes,
    });
    return {
      jobId: job.id ?? '',
      queue: QUEUE_NAMES.MAINTENANCE,
      olderThanMinutes,
    };
  },

  async waitForJobResult<T = unknown>(
    queueName: (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES],
    jobId: string,
    timeoutMs = 10000
  ): Promise<T> {
    const { notificationQueue: nQueue, maintenanceQueue: mQueue } = ensureQueues();
    const queue = queueName === QUEUE_NAMES.NOTIFICATIONS ? nQueue : mQueue;

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const job = await queue.getJob(jobId);
      if (job) {
        const state = await job.getState();
        if (state === 'completed') {
          return job.returnvalue as T;
        }
        if (state === 'failed') {
          throw new Error(job.failedReason || 'Background job failed');
        }
      }
      await new Promise((r) => setTimeout(r, 50));
    }

    throw new Error(`Timed out waiting for BullMQ job ${jobId}`);
  },

  async getQueueStatus() {
    const { notificationQueue: nQueue, maintenanceQueue: mQueue } = ensureQueues();

    const [
      notifCounts,
      maintCounts,
      schedulers,
      recentNotifJobs,
      recentMaintJobs,
    ] = await Promise.all([
      nQueue.getJobCounts(
        'waiting',
        'active',
        'completed',
        'failed',
        'delayed'
      ),
      mQueue.getJobCounts(
        'waiting',
        'active',
        'completed',
        'failed',
        'delayed'
      ),
      mQueue.getJobSchedulers(0, 20),
      nQueue.getJobs(['completed', 'failed', 'active', 'waiting'], 0, 14, false),
      mQueue.getJobs(['completed', 'failed', 'active', 'waiting'], 0, 14, false),
    ]);

    const formatJob = async (
      job: Job,
      queue: string
    ): Promise<{
      id: string;
      queue: string;
      name: string;
      status: string;
      attemptsMade: number;
      result: unknown;
      failedReason: string | null;
      timestamp: string;
      finishedOn: string | null;
    }> => ({
      id: String(job.id ?? ''),
      queue,
      name: job.name,
      status: await job.getState(),
      attemptsMade: job.attemptsMade,
      result: job.returnvalue ?? null,
      failedReason: job.failedReason ?? null,
      timestamp: new Date(job.timestamp).toISOString(),
      finishedOn: job.finishedOn
        ? new Date(job.finishedOn).toISOString()
        : null,
    });

    const recentJobs = (
      await Promise.all([
        ...recentMaintJobs.map((j) => formatJob(j, QUEUE_NAMES.MAINTENANCE)),
        ...recentNotifJobs.map((j) => formatJob(j, QUEUE_NAMES.NOTIFICATIONS)),
      ])
    ).sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    return {
      workersActive: Boolean(notificationWorker && maintenanceWorker),
      queues: [
        { name: QUEUE_NAMES.NOTIFICATIONS, counts: notifCounts },
        { name: QUEUE_NAMES.MAINTENANCE, counts: maintCounts },
      ],
      schedulers: schedulers.map((s) => ({
        id: s.key,
        name: s.name,
        pattern: s.pattern ?? null,
        everyMs: s.every ? Number(s.every) : null,
        nextRunAt: s.next ? new Date(s.next).toISOString() : null,
      })),
      recentJobs: recentJobs.slice(0, 25),
    };
  },

  async closeJobs(): Promise<void> {
    await Promise.allSettled([
      notificationWorker?.close(),
      maintenanceWorker?.close(),
      notificationQueue?.close(),
      maintenanceQueue?.close(),
    ]);
    notificationWorker = null;
    maintenanceWorker = null;
    notificationQueue = null;
    maintenanceQueue = null;
  },
};
