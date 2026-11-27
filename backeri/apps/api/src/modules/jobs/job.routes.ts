import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import {
  DEFAULT_SLOT_HORIZON_DAYS,
  DEFAULT_STALE_PENDING_MINUTES,
} from './job.config';
import { jobsService } from './job.queues';

const router = Router();

const rollingSlotsBodySchema = z.object({
  daysAhead: z.number().int().min(1).max(90).default(DEFAULT_SLOT_HORIZON_DAYS),
});

const staleCleanupBodySchema = z.object({
  olderThanMinutes: z
    .number()
    .int()
    .min(1)
    .max(1440)
    .default(DEFAULT_STALE_PENDING_MINUTES),
});

router.get(
  '/admin/jobs',
  authenticate,
  requireRole('ADMIN'),
  asyncHandler(async (_req, res) => {
    const status = await jobsService.getQueueStatus();
    res.status(200).json(status);
  })
);

router.post(
  '/admin/jobs/rolling-slots',
  authenticate,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = rollingSlotsBodySchema.parse(req.body ?? {});
    const queued = await jobsService.triggerRollingSlotsNow(parsed.daysAhead);
    res.status(202).json({ queued: true, ...queued });
  })
);

router.post(
  '/admin/jobs/cleanup-pending',
  authenticate,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = staleCleanupBodySchema.parse(req.body ?? {});
    const queued = await jobsService.triggerStaleCleanupNow(
      parsed.olderThanMinutes
    );
    res.status(202).json({ queued: true, ...queued });
  })
);

export const jobRoutes = router;
