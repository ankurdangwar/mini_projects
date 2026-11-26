import crypto from 'crypto';
import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import {
  canTransitionOrderStatus,
  type FulfillmentType,
  type UserRole,
} from '@backeri/shared';
import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/errorHandler';
import { getSlotStartDateTime } from '../slots/slot.service';
import { paymentProvider } from '../payments/payment.provider';
import { realtimeService } from '../realtime/realtime.service';
import { notificationService } from '../notifications/notification.service';

const ORDER_INCLUDE = {
  user: { select: { id: true, name: true, email: true, phone: true } },
  slot: true,
  items: {
    include: {
      variant: {
        include: { product: true },
      },
    },
  },
  payments: true,
} satisfies Prisma.OrderInclude;

export const orderService = {
  async createOrder(
    userId: string,
    input: {
      slotId: string;
      holdId?: string;
      fulfillmentType: FulfillmentType;
      deliveryAddress?: Record<string, unknown>;
      idempotencyKey: string;
      items: Array<{
        variantId: string;
        quantity: number;
        customNotes?: Record<string, unknown>;
      }>;
    }
  ) {
    // 1. Idempotency check — return existing order & payment intent on network retry
    const existing = await prisma.order.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: ORDER_INCLUDE,
    });

    if (existing) {
      if (existing.userId !== userId) {
        throw new AppError(409, 'Idempotency key already used by another account', 'IDEMPOTENCY_CONFLICT');
      }
      const existingPayment = existing.payments[0];
      return {
        order: existing,
        paymentIntent: existingPayment
          ? {
              provider: existingPayment.provider,
              providerRef: existingPayment.providerRef,
              amountCents: existingPayment.amountCents,
              status: existingPayment.status,
            }
          : null,
        idempotent: true,
      };
    }

    // 2. Fetch variants & products, validate availability, compute lead-time & price snapshots
    const variantIds = Array.from(new Set(input.items.map((i) => i.variantId)));
    const variants = await prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: { product: true },
    });

    const variantMap = new Map(variants.map((v) => [v.id, v]));
    let maxLeadTimeHours = 0;
    let totalAmountCents = 0;

    const orderItemsData = input.items.map((item) => {
      const variant = variantMap.get(item.variantId);
      if (!variant) {
        throw new AppError(400, `Variant ${item.variantId} not found`, 'INVALID_VARIANT');
      }
      if (!variant.isActive || !variant.product.isActive) {
        throw new AppError(
          409,
          `${variant.product.name} (${variant.label}) is currently sold out`,
          'ITEM_SOLD_OUT'
        );
      }

      maxLeadTimeHours = Math.max(maxLeadTimeHours, variant.product.leadTimeHours);
      const unitPriceCents = variant.product.basePriceCents + variant.priceDeltaCents;
      totalAmountCents += unitPriceCents * item.quantity;

      return {
        variantId: variant.id,
        quantity: item.quantity,
        unitPriceCents,
        customNotes: item.customNotes as Prisma.InputJsonValue | undefined,
      };
    });

    // 3. Validate selected time slot against max cart lead time & capacity
    const slot = await prisma.timeSlot.findUnique({ where: { id: input.slotId } });
    if (!slot) {
      throw new AppError(404, 'Selected pickup/delivery slot not found', 'SLOT_NOT_FOUND');
    }
    if (slot.isClosed) {
      throw new AppError(409, 'Selected time slot is closed', 'SLOT_CLOSED');
    }
    if (slot.bookedOrders >= slot.maxOrders) {
      throw new AppError(409, 'Selected time slot is fully booked', 'SLOT_FULL');
    }

    const slotStart = getSlotStartDateTime(slot.date, slot.startTime);
    const minAllowedMs = Date.now() + maxLeadTimeHours * 60 * 60 * 1000;
    if (slotStart.getTime() < minAllowedMs) {
      throw new AppError(
        400,
        `Items in your cart require at least ${maxLeadTimeHours} hours of bakery prep notice. Please pick a later slot.`,
        'LEAD_TIME_NOT_MET'
      );
    }

    // 4. Create PENDING order + payment intent
    const orderNumber = `BK-${crypto.randomInt(100000, 999999)}`;
    const order = await prisma.order.create({
      data: {
        orderNumber,
        userId,
        slotId: slot.id,
        status: OrderStatus.PENDING,
        totalAmountCents,
        fulfillmentType: input.fulfillmentType,
        deliveryAddress: input.deliveryAddress as Prisma.InputJsonValue | undefined,
        idempotencyKey: input.idempotencyKey,
        holdId: input.holdId,
        items: {
          create: orderItemsData,
        },
      },
      include: ORDER_INCLUDE,
    });

    const intent = await paymentProvider.createPaymentIntent({
      orderId: order.id,
      amountCents: totalAmountCents,
      idempotencyKey: input.idempotencyKey,
    });

    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: intent.provider,
        providerRef: intent.providerRef,
        amountCents: totalAmountCents,
        status: PaymentStatus.PENDING,
        idempotencyKey: `pay_${input.idempotencyKey}`,
      },
    });

    const refreshedOrder = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: ORDER_INCLUDE,
    });

    return {
      order: refreshedOrder,
      paymentIntent: {
        ...intent,
        status: payment.status,
      },
      idempotent: false,
    };
  },

  async getOrderById(orderId: string, actor: { userId: string; role: UserRole }) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });
    if (!order) {
      throw new AppError(404, 'Order not found', 'ORDER_NOT_FOUND');
    }

    if (actor.role === 'CUSTOMER' && order.userId !== actor.userId) {
      throw new AppError(403, 'You do not have access to this order', 'FORBIDDEN');
    }

    return order;
  },

  async listCustomerOrders(userId: string) {
    return prisma.order.findMany({
      where: { userId },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  },

  async listAdminOrders(params: {
    status?: OrderStatus;
    date?: string;
    slotId?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 50));

    const where: Prisma.OrderWhereInput = {};
    if (params.status) {
      where.status = params.status;
    } else {
      // By default show active & completed kitchen orders (hide unpaid PENDING noise unless requested)
      where.status = { not: OrderStatus.PENDING };
    }

    if (params.slotId) {
      where.slotId = params.slotId;
    }

    if (params.date) {
      const target = new Date(`${params.date}T00:00:00.000Z`);
      if (!Number.isNaN(target.getTime())) {
        where.slot = { date: target };
      }
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: ORDER_INCLUDE,
        orderBy: [{ slot: { date: 'asc' } }, { slot: { startTime: 'asc' } }, { createdAt: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.order.count({ where }),
    ]);

    return {
      orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async transitionOrderStatus(
    orderId: string,
    nextStatus: OrderStatus,
    actorRole: UserRole,
    reason?: string
  ) {
    const current = await prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });
    if (!current) {
      throw new AppError(404, 'Order not found', 'ORDER_NOT_FOUND');
    }

    const check = canTransitionOrderStatus(current.status, nextStatus, actorRole);
    if (!check.allowed) {
      throw new AppError(
        check.reason?.includes('Only admins') ? 403 : 400,
        check.reason ?? 'Invalid status transition',
        'INVALID_TRANSITION'
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const order = await tx.order.update({
        where: { id: orderId },
        data: {
          status: nextStatus,
          cancelReason: nextStatus === OrderStatus.CANCELLED ? reason ?? 'Cancelled by admin' : undefined,
        },
        include: ORDER_INCLUDE,
      });

      // If an already-booked paid order is cancelled, free up the slot and refund payment
      const wasBooked = ['PAID', 'BAKING', 'READY'].includes(current.status);
      if (nextStatus === OrderStatus.CANCELLED && wasBooked) {
        await tx.$executeRaw(
          Prisma.sql`
            UPDATE time_slots
            SET booked_orders = GREATEST(0, booked_orders - 1)
            WHERE id = ${current.slotId}::uuid
          `
        );

        const succeededPayment = current.payments.find(
          (p) => p.status === PaymentStatus.SUCCEEDED
        );
        if (succeededPayment) {
          await tx.payment.update({
            where: { id: succeededPayment.id },
            data: { status: PaymentStatus.REFUNDED },
          });
          await paymentProvider.refundPayment(
            succeededPayment.providerRef,
            succeededPayment.amountCents
          );
        }
      }

      return order;
    });

    await realtimeService.publish('order.status_updated', updated);

    if (nextStatus === OrderStatus.READY) {
      await notificationService.sendOrderReady(updated);
    } else if (nextStatus === OrderStatus.CANCELLED) {
      await notificationService.sendOrderCancelled({
        id: updated.id,
        orderNumber: updated.orderNumber,
        reason: updated.cancelReason ?? undefined,
        user: updated.user,
      });
    }

    return updated;
  },
};
