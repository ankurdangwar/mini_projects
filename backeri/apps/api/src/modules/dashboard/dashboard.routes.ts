import { Router } from 'express';
import { WasteReason } from '@prisma/client';
import { createWasteLogSchema } from '@backeri/shared';
import { authenticate, requireRole } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { dashboardService } from './dashboard.service';

const router = Router();

router.get(
  '/admin/prep-sheet',
  authenticate,
  requireRole('BAKER', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const dateStr =
      typeof req.query.date === 'string' && req.query.date.length === 10
        ? req.query.date
        : today;

    const prepSheet = await dashboardService.getPrepSheet(dateStr);
    res.status(200).json(prepSheet);
  })
);

router.get(
  '/admin/waste',
  authenticate,
  requireRole('BAKER', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const date =
      typeof req.query.date === 'string' && req.query.date.length === 10
        ? req.query.date
        : undefined;
    const days = req.query.days ? Number(req.query.days) : 14;
    const result = await dashboardService.listWasteLogs({
      date,
      days: Number.isFinite(days) ? days : 14,
    });
    res.status(200).json(result);
  })
);

router.post(
  '/admin/waste',
  authenticate,
  requireRole('BAKER', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = createWasteLogSchema.parse(req.body);
    const wasteLog = await dashboardService.createWasteLog(req.user!.userId, {
      ...parsed,
      reason: parsed.reason as WasteReason,
    });
    res.status(201).json({ wasteLog });
  })
);

router.delete(
  '/admin/waste/:id',
  authenticate,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const result = await dashboardService.deleteWasteLog(String(req.params.id));
    res.status(200).json(result);
  })
);

router.get(
  '/admin/analytics',
  authenticate,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const days = req.query.days ? Number(req.query.days) : 14;
    const analytics = await dashboardService.getAnalytics(
      Number.isFinite(days) ? days : 14
    );
    res.status(200).json(analytics);
  })
);

router.get(
  '/admin/notifications',
  authenticate,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 40;
    const notifications = await dashboardService.getRecentNotifications(
      Number.isFinite(limit) ? limit : 40
    );
    res.status(200).json({ notifications });
  })
);

export const dashboardRoutes = router;
