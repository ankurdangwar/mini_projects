import { Router } from 'express';
import { blackoutDateSchema, updateSlotSchema } from '@backeri/shared';
import { authenticate, requireRole } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { slotService } from './slot.service';

const router = Router();

router.get(
  '/slots',
  asyncHandler(async (req, res) => {
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    const leadTime =
      req.query.lead_time !== undefined
        ? Number(req.query.lead_time)
        : req.query.leadTime !== undefined
          ? Number(req.query.leadTime)
          : 0;

    const slots = await slotService.getAvailableSlots({
      date,
      leadTimeHours: Number.isFinite(leadTime) ? leadTime : 0,
    });

    res.status(200).json({ slots });
  })
);

router.post(
  '/slots/:id/hold',
  asyncHandler(async (req, res) => {
    const existingHoldId =
      typeof req.body?.holdId === 'string' ? req.body.holdId : undefined;
    const hold = await slotService.createSoftHold(String(req.params.id), existingHoldId);
    res.status(201).json({ hold });
  })
);

router.delete(
  '/slots/:id/hold/:holdId',
  asyncHandler(async (req, res) => {
    await slotService.releaseHold(String(req.params.id), String(req.params.holdId));
    res.status(200).json({ released: true });
  })
);

router.get(
  '/admin/slots',
  authenticate,
  requireRole('BAKER', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    const slots = await slotService.getAvailableSlots({
      date,
      leadTimeHours: 0,
      includeUnavailable: true,
    });
    res.status(200).json({ slots });
  })
);

router.patch(
  '/admin/slots/:id',
  authenticate,
  requireRole('BAKER', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = updateSlotSchema.parse(req.body);
    const slot = await slotService.updateSlot(String(req.params.id), parsed);
    res.status(200).json({ slot });
  })
);

router.post(
  '/admin/slots/blackout',
  authenticate,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = blackoutDateSchema.parse(req.body);
    const result = await slotService.blackoutDate(parsed.date, parsed.isClosed);
    res.status(200).json(result);
  })
);

export const slotRoutes = router;
