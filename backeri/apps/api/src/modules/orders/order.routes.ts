import { Router } from 'express';
import { FulfillmentType, OrderStatus } from '@prisma/client';
import { createOrderSchema, updateOrderStatusSchema } from '@backeri/shared';
import { authenticate, requireRole } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { orderService } from './order.service';

const router = Router();

router.post(
  '/orders',
  authenticate,
  asyncHandler(async (req, res) => {
    const headerKey = req.headers['idempotency-key'];
    const bodyWithKey = {
      ...req.body,
      idempotencyKey:
        req.body?.idempotencyKey ??
        (typeof headerKey === 'string' ? headerKey : undefined),
    };

    const parsed = createOrderSchema.parse(bodyWithKey);
    const result = await orderService.createOrder(req.user!.userId, parsed);
    res.status(result.idempotent ? 200 : 201).json(result);
  })
);

router.get(
  '/orders',
  authenticate,
  asyncHandler(async (req, res) => {
    const orders = await orderService.listCustomerOrders(req.user!.userId);
    res.status(200).json({ orders });
  })
);

router.get(
  '/orders/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const order = await orderService.getOrderById(String(req.params.id), {
      userId: req.user!.userId,
      role: req.user!.role,
    });
    res.status(200).json({ order });
  })
);

router.get(
  '/admin/orders',
  authenticate,
  requireRole('BAKER', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const status =
      typeof req.query.status === 'string' &&
      Object.values(OrderStatus).includes(req.query.status as OrderStatus)
        ? (req.query.status as OrderStatus)
        : undefined;
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    const slotId = typeof req.query.slotId === 'string' ? req.query.slotId : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const fulfillmentType =
      typeof req.query.fulfillmentType === 'string' &&
      Object.values(FulfillmentType).includes(
        req.query.fulfillmentType as FulfillmentType
      )
        ? (req.query.fulfillmentType as FulfillmentType)
        : undefined;
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 50;

    const result = await orderService.listAdminOrders({
      status,
      date,
      slotId,
      q,
      fulfillmentType,
      page,
      limit,
    });
    res.status(200).json(result);
  })
);

router.patch(
  '/admin/orders/:id/status',
  authenticate,
  requireRole('BAKER', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = updateOrderStatusSchema.parse(req.body);
    const order = await orderService.transitionOrderStatus(
      String(req.params.id),
      parsed.status as OrderStatus,
      req.user!.role,
      parsed.reason
    );
    res.status(200).json({ order });
  })
);

export const orderRoutes = router;
