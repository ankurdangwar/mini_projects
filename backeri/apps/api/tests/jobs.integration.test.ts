import crypto from 'crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/config/prisma';
import { closeRedis } from '../src/config/redis';
import { QUEUE_NAMES } from '../src/modules/jobs/job.config';
import { jobsService } from '../src/modules/jobs/job.queues';
import type {
  RollingSlotsResult,
  StaleCleanupResult,
} from '../src/modules/jobs/job.handlers';
import { slotService } from '../src/modules/slots/slot.service';
import { notificationService } from '../src/modules/notifications/notification.service';

const app = createApp();

let adminToken = '';
let bakerToken = '';

async function loginAs(email: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: 'password123' });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

describe('BullMQ Background Jobs (Rolling Slots, Stale Cleanup, Async Notifications)', () => {
  beforeAll(async () => {
    await jobsService.startWorkers({ runInitialChecks: false });
    adminToken = await loginAs('admin@backeri.local');
    bakerToken = await loginAs('baker@backeri.local');
  });

  afterAll(async () => {
    await Promise.allSettled([
      jobsService.closeJobs(),
      prisma.$disconnect(),
      closeRedis(),
    ]);
  });

  it('registers recurring schedulers and enforces Admin-only access on /admin/jobs', async () => {
    const bakerRes = await request(app)
      .get('/api/v1/admin/jobs')
      .set('Authorization', `Bearer ${bakerToken}`);
    expect(bakerRes.status).toBe(403);

    const adminRes = await request(app)
      .get('/api/v1/admin/jobs')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.workersActive).toBe(true);

    const schedulerNames = (
      adminRes.body.schedulers as Array<{ name: string }>
    ).map((s) => s.name);
    expect(schedulerNames).toContain('rolling-slot-generator');
    expect(schedulerNames).toContain('stale-pending-cleanup');
  });

  it('generates upcoming daily slots idempotently without overwriting manual overrides', async () => {
    const today = new Date();
    const day15 = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 14)
    );
    const day16 = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 15)
    );

    // Clean days 15 & 16 if present from prior runs
    await prisma.timeSlot.deleteMany({
      where: { date: { in: [day15, day16] } },
    });

    try {
      const trigger1 = await request(app)
        .post('/api/v1/admin/jobs/rolling-slots')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ daysAhead: 16 });
      expect(trigger1.status).toBe(202);

      const result1 = await jobsService.waitForJobResult<RollingSlotsResult>(
        QUEUE_NAMES.MAINTENANCE,
        trigger1.body.jobId
      );
      expect(result1.createdSlots).toBe(10); // 2 new days x 5 windows

      // Override one of the generated slots manually
      const generatedSlot = await prisma.timeSlot.findFirstOrThrow({
        where: { date: day15, startTime: '08:00' },
      });
      await prisma.timeSlot.update({
        where: { id: generatedSlot.id },
        data: { maxOrders: 25, isClosed: true },
      });

      // Second run must be idempotent and preserve manual override
      const trigger2 = await request(app)
        .post('/api/v1/admin/jobs/rolling-slots')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ daysAhead: 16 });
      const result2 = await jobsService.waitForJobResult<RollingSlotsResult>(
        QUEUE_NAMES.MAINTENANCE,
        trigger2.body.jobId
      );
      expect(result2.createdSlots).toBe(0);

      const preserved = await prisma.timeSlot.findUniqueOrThrow({
        where: { id: generatedSlot.id },
      });
      expect(preserved.maxOrders).toBe(25);
      expect(preserved.isClosed).toBe(true);
    } finally {
      await prisma.timeSlot.deleteMany({
        where: { date: { in: [day15, day16] } },
      });
    }
  });

  it('expires stale PENDING orders, fails their payments, releases Redis holds, and keeps fresh orders intact', async () => {
    const customer = await prisma.user.findUniqueOrThrow({
      where: { email: 'customer@backeri.local' },
    });
    const sourdough = await prisma.product.findUniqueOrThrow({
      where: { slug: 'country-sourdough-boule' },
      include: { variants: true },
    });

    const futureDate = new Date(Date.now() + 25 * 24 * 60 * 60 * 1000);
    const dateOnly = new Date(
      Date.UTC(futureDate.getUTCFullYear(), futureDate.getUTCMonth(), futureDate.getUTCDate())
    );
    const slot = await prisma.timeSlot.create({
      data: {
        date: dateOnly,
        startTime: '15:00',
        endTime: '16:00',
        maxOrders: 5,
        bookedOrders: 0,
      },
    });

    const hold = await slotService.createSoftHold(slot.id);
    const staleTimestamp = new Date(Date.now() - 35 * 60 * 1000);

    const staleOrder = await prisma.order.create({
      data: {
        orderNumber: `BK-STALE-${crypto.randomInt(1000, 9999)}`,
        userId: customer.id,
        slotId: slot.id,
        status: 'PENDING',
        totalAmountCents: 950,
        fulfillmentType: 'PICKUP',
        idempotencyKey: `stale_${crypto.randomUUID()}`,
        holdId: hold.holdId,
        createdAt: staleTimestamp,
        items: {
          create: [
            {
              variantId: sourdough.variants[0].id,
              quantity: 1,
              unitPriceCents: 950,
            },
          ],
        },
        payments: {
          create: {
            provider: 'sandbox',
            providerRef: `pi_stale_${crypto.randomUUID().slice(0, 8)}`,
            amountCents: 950,
            status: 'PENDING',
            idempotencyKey: `pay_stale_${crypto.randomUUID()}`,
          },
        },
      },
    });

    const freshOrder = await prisma.order.create({
      data: {
        orderNumber: `BK-FRESH-${crypto.randomInt(1000, 9999)}`,
        userId: customer.id,
        slotId: slot.id,
        status: 'PENDING',
        totalAmountCents: 950,
        fulfillmentType: 'PICKUP',
        idempotencyKey: `fresh_${crypto.randomUUID()}`,
        items: {
          create: [
            {
              variantId: sourdough.variants[0].id,
              quantity: 1,
              unitPriceCents: 950,
            },
          ],
        },
      },
    });

    try {
      expect(await slotService.countActiveHolds(slot.id)).toBe(1);

      const trigger = await request(app)
        .post('/api/v1/admin/jobs/cleanup-pending')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ olderThanMinutes: 20 });
      expect(trigger.status).toBe(202);

      const result = await jobsService.waitForJobResult<StaleCleanupResult>(
        QUEUE_NAMES.MAINTENANCE,
        trigger.body.jobId
      );
      expect(result.expiredOrderIds).toContain(staleOrder.id);
      expect(result.expiredOrderIds).not.toContain(freshOrder.id);

      const updatedStale = await prisma.order.findUniqueOrThrow({
        where: { id: staleOrder.id },
        include: { payments: true },
      });
      expect(updatedStale.status).toBe('CANCELLED');
      expect(updatedStale.payments[0].status).toBe('FAILED');

      // Redis hold was automatically released
      expect(await slotService.countActiveHolds(slot.id)).toBe(0);

      // Fresh PENDING order untouched
      const updatedFresh = await prisma.order.findUniqueOrThrow({
        where: { id: freshOrder.id },
      });
      expect(updatedFresh.status).toBe('PENDING');
    } finally {
      await prisma.order.deleteMany({
        where: { id: { in: [staleOrder.id, freshOrder.id] } },
      });
      await prisma.timeSlot.delete({ where: { id: slot.id } });
    }
  });

  it('dispatches order confirmation and ready notifications asynchronously via BullMQ queue', async () => {
    const sampleOrder = await prisma.order.findFirstOrThrow({
      include: { user: true, slot: true },
    });

    const uniqueOrderNum = `BK-ASYNC-${crypto.randomInt(10000, 99999)}`;

    await notificationService.sendOrderReady({
      id: sampleOrder.id,
      orderNumber: uniqueOrderNum,
      fulfillmentType: 'PICKUP',
      user: sampleOrder.user,
      slot: sampleOrder.slot,
    });

    // Poll DB briefly until BullMQ notification worker persists the async EMAIL + SMS logs
    let logs: Array<{ channel: string; body: string }> = [];
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      logs = await prisma.notificationLog.findMany({
        where: {
          orderId: sampleOrder.id,
          body: { contains: uniqueOrderNum },
        },
      });
      if (logs.length >= 2) break;
      await new Promise((r) => setTimeout(r, 100));
    }

    expect(logs.length).toBeGreaterThanOrEqual(2);
    const channels = logs.map((l) => l.channel).sort();
    expect(channels).toEqual(['EMAIL', 'SMS']);

    await prisma.notificationLog.deleteMany({
      where: {
        orderId: sampleOrder.id,
        body: { contains: uniqueOrderNum },
      },
    });
  });
});
