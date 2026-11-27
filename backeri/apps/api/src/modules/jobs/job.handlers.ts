import { NotificationChannel, OrderStatus, PaymentStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { slotService } from '../slots/slot.service';
import {
  DEFAULT_SLOT_HORIZON_DAYS,
  DEFAULT_SLOT_WINDOWS,
  DEFAULT_STALE_PENDING_MINUTES,
} from './job.config';

export interface NotificationJobPayload {
  kind: 'order.confirmation' | 'order.ready' | 'order.cancelled' | 'direct.message';
  orderId?: string;
  orderNumber?: string;
  messages: Array<{
    orderId?: string;
    channel: NotificationChannel;
    recipient: string;
    subject?: string;
    body: string;
  }>;
}

export interface RollingSlotsResult {
  daysAhead: number;
  startDate: string;
  endDate: string;
  evaluatedSlots: number;
  createdSlots: number;
}

export interface StaleCleanupResult {
  olderThanMinutes: number;
  cutoffIso: string;
  expiredOrderCount: number;
  expiredOrderIds: string[];
  releasedHoldsCount: number;
}

/**
 * Rolling Slot Generator:
 * Ensures upcoming daily pickup/delivery slots exist across `daysAhead` days.
 * Uses `skipDuplicates: true` (ON CONFLICT DO NOTHING) so existing manual capacity
 * overrides and holiday blackouts are never overwritten.
 */
export async function handleRollingSlotGeneration(
  daysAhead = DEFAULT_SLOT_HORIZON_DAYS
): Promise<RollingSlotsResult> {
  const safeDays = Math.min(90, Math.max(1, Math.floor(daysAhead)));
  const now = new Date();
  const baseDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );

  const rows: Array<{
    date: Date;
    startTime: string;
    endTime: string;
    maxOrders: number;
    bookedOrders: number;
    isClosed: boolean;
  }> = [];

  for (let dayOffset = 0; dayOffset < safeDays; dayOffset++) {
    const date = new Date(baseDate.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    for (const win of DEFAULT_SLOT_WINDOWS) {
      rows.push({
        date,
        startTime: win.startTime,
        endTime: win.endTime,
        maxOrders: win.maxOrders,
        bookedOrders: 0,
        isClosed: false,
      });
    }
  }

  const result = await prisma.timeSlot.createMany({
    data: rows,
    skipDuplicates: true,
  });

  const endDate = new Date(
    baseDate.getTime() + (safeDays - 1) * 24 * 60 * 60 * 1000
  );

  return {
    daysAhead: safeDays,
    startDate: baseDate.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10),
    evaluatedSlots: rows.length,
    createdSlots: result.count,
  };
}

/**
 * Stale PENDING Order Cleanup:
 * Expires abandoned checkout orders still in PENDING status after `olderThanMinutes`.
 * Marks matching PENDING payments as FAILED and releases any lingering Redis slot holds.
 * Safe against concurrent payment webhooks because transitions require status = PENDING.
 */
export async function handleStalePendingCleanup(
  olderThanMinutes = DEFAULT_STALE_PENDING_MINUTES
): Promise<StaleCleanupResult> {
  const safeMinutes = Math.min(1440, Math.max(1, Math.floor(olderThanMinutes)));
  const cutoff = new Date(Date.now() - safeMinutes * 60 * 1000);

  const staleOrders = await prisma.order.findMany({
    where: {
      status: OrderStatus.PENDING,
      createdAt: { lte: cutoff },
    },
    select: {
      id: true,
      slotId: true,
      holdId: true,
    },
    take: 200,
  });

  const expiredOrderIds: string[] = [];
  let releasedHoldsCount = 0;

  for (const order of staleOrders) {
    const updatedCount = await prisma.$transaction(async (tx) => {
      const orderUpdate = await tx.order.updateMany({
        where: {
          id: order.id,
          status: OrderStatus.PENDING,
        },
        data: {
          status: OrderStatus.CANCELLED,
          cancelReason: `Checkout expired after ${safeMinutes} minutes without payment`,
        },
      });

      if (orderUpdate.count === 0) {
        return 0;
      }

      await tx.payment.updateMany({
        where: {
          orderId: order.id,
          status: PaymentStatus.PENDING,
        },
        data: {
          status: PaymentStatus.FAILED,
        },
      });

      return orderUpdate.count;
    });

    if (updatedCount > 0) {
      expiredOrderIds.push(order.id);
      if (order.holdId) {
        await slotService.releaseHold(order.slotId, order.holdId);
        releasedHoldsCount++;
      }
    }
  }

  return {
    olderThanMinutes: safeMinutes,
    cutoffIso: cutoff.toISOString(),
    expiredOrderCount: expiredOrderIds.length,
    expiredOrderIds,
    releasedHoldsCount,
  };
}
