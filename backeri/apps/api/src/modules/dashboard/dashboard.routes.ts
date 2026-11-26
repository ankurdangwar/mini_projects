import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { dashboardService } from './dashboard.service';

const router = Router();

router.get(
  '/admin/prep-sheet',
  authenticate,
  requireRole('BAKER', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    const prepSheet = await dashboardService.getPrepSheet(date);
    res.status(200).json(prepSheet);
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
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const notifications = await dashboardService.getNotificationLogs(
      Number.isFinite(limit) ? limit : 50
    );
    res.status(200).json({ notifications });
  })
);

export const dashboardRoutes = router;
