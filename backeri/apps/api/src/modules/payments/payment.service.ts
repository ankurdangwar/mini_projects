import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/errorHandler';
import { slotService } from '../slots/slot.service';
import { realtimeService } from '../realtime/realtime.service';
import { notificationService } from '../notifications/notification.service';
import { paymentProvider } from './payment.provider';

interface LockedPaymentRow {
  id: string;
  order_id: string;
  provider_ref: string;
  amount_cents: number;
  status: PaymentStatus;
  idempotency_key: string;
}

interface LockedSlotRow {
  id: string;
  max_orders: number;
  booked_orders: number;
  is_closed: boolean;
}

export const paymentService = {
  async handleWebhook(payload: {
    eventId: string;
    idempotencyKey: string;
    providerRef: string;
    orderId: string;
    status: 'SUCCEEDED' | 'FAILED';
    amountCents: number;
  }) {
    const outcome = await prisma.$transaction(
      async (tx) => {
        // 1. Lock the payment row to guarantee idempotency across simultaneous retries
        const lockedPayments = await tx.$queryRaw<LockedPaymentRow[]>(
          Prisma.sql`
            SELECT id, order_id, provider_ref, amount_cents, status, idempotency_key
            FROM payments
            WHERE provider_ref = ${payload.providerRef}
            FOR UPDATE
          `
        );

        const payment = lockedPayments[0];
        if (!payment) {
          throw new AppError(404, 'Payment record not found', 'PAYMENT_NOT_FOUND');
        }

        if (payment.order_id !== payload.orderId) {
          throw new AppError(400, 'Payment does not match orderId', 'PAYMENT_ORDER_MISMATCH');
        }

        // Already finalized? Return idempotently without re-incrementing slot or re-notifying
        if (payment.status !== PaymentStatus.PENDING) {
          const existingOrder = await tx.order.findUniqueOrThrow({
            where: { id: payment.order_id },
          });
          return {
            idempotent: true,
            orderStatus: existingOrder.status,
            paymentStatus: payment.status,
            orderId: existingOrder.id,
            slotId: existingOrder.slotId,
            holdId: existingOrder.holdId,
            needsRefund: false,
          };
        }

        const order = await tx.order.findUniqueOrThrow({
          where: { id: payment.order_id },
        });

        // 2. If gateway reports FAILED, cancel order without touching slot booked count
        if (payload.status === 'FAILED') {
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: PaymentStatus.FAILED,
              metadata: {
                eventId: payload.eventId,
                webhookIdempotencyKey: payload.idempotencyKey,
              },
            },
          });

          await tx.order.update({
            where: { id: order.id },
            data: {
              status: OrderStatus.CANCELLED,
              cancelReason: 'Payment authorization failed',
            },
          });

          return {
            idempotent: false,
            orderStatus: OrderStatus.CANCELLED,
            paymentStatus: PaymentStatus.FAILED,
            orderId: order.id,
            slotId: order.slotId,
            holdId: order.holdId,
            needsRefund: false,
          };
        }

        // 3. Payment SUCCEEDED -> Lock the time_slots row with SELECT ... FOR UPDATE
        const lockedSlots = await tx.$queryRaw<LockedSlotRow[]>(
          Prisma.sql`
            SELECT id, max_orders, booked_orders, is_closed
            FROM time_slots
            WHERE id = ${order.slotId}::uuid
            FOR UPDATE
          `
        );

        const slot = lockedSlots[0];
        if (!slot) {
          throw new AppError(404, 'Associated time slot not found', 'SLOT_NOT_FOUND');
        }

        // 4. Verify real capacity under lock
        if (slot.is_closed || slot.booked_orders >= slot.max_orders) {
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: PaymentStatus.REFUNDED,
              metadata: {
                eventId: payload.eventId,
                autoRefundReason: 'SLOT_CAPACITY_EXCEEDED',
              },
            },
          });

          await tx.order.update({
            where: { id: order.id },
            data: {
              status: OrderStatus.CANCELLED,
              cancelReason:
                'Selected pickup/delivery slot filled before payment settled. Refunded automatically.',
            },
          });

          return {
            idempotent: false,
            orderStatus: OrderStatus.CANCELLED,
            paymentStatus: PaymentStatus.REFUNDED,
            orderId: order.id,
            slotId: order.slotId,
            holdId: order.holdId,
            needsRefund: true,
            providerRef: payment.provider_ref,
            amountCents: payment.amount_cents,
          };
        }

        // 5. Capacity available -> increment booked_orders & mark order PAID
        await tx.timeSlot.update({
          where: { id: slot.id },
          data: { bookedOrders: { increment: 1 } },
        });

        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.SUCCEEDED,
            metadata: {
              eventId: payload.eventId,
              webhookIdempotencyKey: payload.idempotencyKey,
            },
          },
        });

        await tx.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.PAID },
        });

        return {
          idempotent: false,
          orderStatus: OrderStatus.PAID,
          paymentStatus: PaymentStatus.SUCCEEDED,
          orderId: order.id,
          slotId: order.slotId,
          holdId: order.holdId,
          needsRefund: false,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 15000,
      }
    );

    if (outcome.holdId) {
      await slotService.releaseHold(outcome.slotId, outcome.holdId);
    }

    if (outcome.idempotent) {
      return outcome;
    }

    const fullOrder = await prisma.order.findUnique({
      where: { id: outcome.orderId },
      include: {
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
      },
    });

    if (fullOrder) {
      if (outcome.orderStatus === OrderStatus.PAID) {
        await realtimeService.publish('order.created', fullOrder);
        await realtimeService.publish('slot.updated', {
          slotId: fullOrder.slot.id,
          bookedOrders: fullOrder.slot.bookedOrders,
          maxOrders: fullOrder.slot.maxOrders,
        });
        await notificationService.sendOrderConfirmation(fullOrder);
      } else if (outcome.needsRefund && outcome.providerRef) {
        await paymentProvider.refundPayment(
          outcome.providerRef,
          outcome.amountCents ?? fullOrder.totalAmountCents
        );
        await notificationService.sendOrderCancelled({
          id: fullOrder.id,
          orderNumber: fullOrder.orderNumber,
          reason: fullOrder.cancelReason ?? undefined,
          user: fullOrder.user,
        });
      }
    }

    return outcome;
  },

  async simulateSandboxPayment(
    providerRef: string,
    mode: 'SUCCEEDED' | 'FAILED' | 'DUPLICATE'
  ) {
    const payment = await prisma.payment.findUnique({
      where: { providerRef },
    });
    if (!payment) {
      throw new AppError(404, 'Sandbox payment intent not found', 'PAYMENT_NOT_FOUND');
    }

    const webhookPayload = {
      eventId: `evt_sandbox_${providerRef}`,
      idempotencyKey: `wh_${providerRef}`,
      providerRef: payment.providerRef,
      orderId: payment.orderId,
      status: mode === 'FAILED' ? ('FAILED' as const) : ('SUCCEEDED' as const),
      amountCents: payment.amountCents,
    };

    if (mode === 'DUPLICATE') {
      const first = await this.handleWebhook(webhookPayload);
      const second = await this.handleWebhook(webhookPayload);
      return { first, second };
    }

    const result = await this.handleWebhook(webhookPayload);
    return { result };
  },
};
