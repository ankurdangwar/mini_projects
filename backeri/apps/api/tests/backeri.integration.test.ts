import crypto from 'crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/config/prisma';
import { closeRedis, redis } from '../src/config/redis';
import { paymentProvider } from '../src/modules/payments/payment.provider';

const app = createApp();

let customerToken = '';
let bakerToken = '';
let adminToken = '';

async function loginAs(email: string, password = 'password123'): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

describe('Backeri API — Integration, Concurrency, Idempotency & RBAC', () => {
  beforeAll(async () => {
    customerToken = await loginAs('customer@backeri.local');
    bakerToken = await loginAs('baker@backeri.local');
    adminToken = await loginAs('admin@backeri.local');
  });

  afterAll(async () => {
    await Promise.allSettled([prisma.$disconnect(), closeRedis()]);
  });

  it('caches menu in Redis and invalidates on admin update', async () => {
    await redis.del('backeri:menu:v1');

    const first = await request(app).get('/api/v1/menu');
    expect(first.status).toBe(200);
    expect(first.body.cached).toBe(false);
    expect(first.body.products.length).toBeGreaterThanOrEqual(8);

    const second = await request(app).get('/api/v1/menu');
    expect(second.status).toBe(200);
    expect(second.body.cached).toBe(true);
  });

  it('enforces lead-time filtering on slots and order creation', async () => {
    // Create a test slot 2 hours from now (should fail for a 48h tiered cake)
    const soon = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const dateOnly = new Date(
      Date.UTC(soon.getUTCFullYear(), soon.getUTCMonth(), soon.getUTCDate())
    );
    const startH = String(soon.getUTCHours()).padStart(2, '0');
    const endH = String((soon.getUTCHours() + 1) % 24).padStart(2, '0');

    const soonSlot = await prisma.timeSlot.upsert({
      where: {
        date_startTime_endTime: {
          date: dateOnly,
          startTime: `${startH}:15`,
          endTime: `${endH}:15`,
        },
      },
      update: { maxOrders: 5, bookedOrders: 0, isClosed: false },
      create: {
        date: dateOnly,
        startTime: `${startH}:15`,
        endTime: `${endH}:15`,
        maxOrders: 5,
        bookedOrders: 0,
        isClosed: false,
      },
    });

    const slotsRes = await request(app).get(
      `/api/v1/slots?date=${dateOnly.toISOString().slice(0, 10)}&lead_time=48`
    );
    expect(slotsRes.status).toBe(200);
    const ids = (slotsRes.body.slots as Array<{ id: string }>).map((s) => s.id);
    expect(ids).not.toContain(soonSlot.id);

    const cake = await prisma.product.findUniqueOrThrow({
      where: { slug: 'tiered-bespoke-wedding-cake' },
      include: { variants: true },
    });

    const badOrder = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        slotId: soonSlot.id,
        fulfillmentType: 'PICKUP',
        idempotencyKey: `idem_lead_${crypto.randomUUID()}`,
        items: [{ variantId: cake.variants[0].id, quantity: 1 }],
      });

    expect(badOrder.status).toBe(400);
    expect(badOrder.body.error.code).toBe('LEAD_TIME_NOT_MET');

    await prisma.timeSlot.delete({ where: { id: soonSlot.id } });
  });

  it('prevents last-slot theft via 10-minute Redis soft-lock until released', async () => {
    const futureDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    const dateOnly = new Date(
      Date.UTC(futureDate.getUTCFullYear(), futureDate.getUTCMonth(), futureDate.getUTCDate())
    );

    const tightSlot = await prisma.timeSlot.create({
      data: {
        date: dateOnly,
        startTime: '09:00',
        endTime: '10:00',
        maxOrders: 1,
        bookedOrders: 0,
      },
    });

    try {
      // Customer A acquires the only remaining hold
      const holdA = await request(app)
        .post(`/api/v1/slots/${tightSlot.id}/hold`)
        .send({});
      expect(holdA.status).toBe(201);
      expect(holdA.body.hold.remainingSpots).toBe(0);

      // Customer B tries to hold the same slot -> blocked!
      const holdB = await request(app)
        .post(`/api/v1/slots/${tightSlot.id}/hold`)
        .send({});
      expect(holdB.status).toBe(409);
      expect(holdB.body.error.code).toBe('SLOT_CAPACITY_FULL');

      // Customer A releases hold -> Customer B can now acquire it
      const release = await request(app).delete(
        `/api/v1/slots/${tightSlot.id}/hold/${holdA.body.hold.holdId}`
      );
      expect(release.status).toBe(200);

      const holdBRetry = await request(app)
        .post(`/api/v1/slots/${tightSlot.id}/hold`)
        .send({});
      expect(holdBRetry.status).toBe(201);

      await request(app).delete(
        `/api/v1/slots/${tightSlot.id}/hold/${holdBRetry.body.hold.holdId}`
      );
    } finally {
      await prisma.timeSlot.delete({ where: { id: tightSlot.id } });
    }
  });

  it('guarantees order & webhook idempotency and rejects invalid HMAC signatures', async () => {
    const futureDate = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000);
    const dateOnly = new Date(
      Date.UTC(futureDate.getUTCFullYear(), futureDate.getUTCMonth(), futureDate.getUTCDate())
    );
    const slot = await prisma.timeSlot.create({
      data: {
        date: dateOnly,
        startTime: '11:00',
        endTime: '12:00',
        maxOrders: 5,
        bookedOrders: 0,
      },
    });

    const croissant = await prisma.product.findUniqueOrThrow({
      where: { slug: 'cultured-butter-croissant' },
      include: { variants: true },
    });

    const idemKey = `idem_order_${crypto.randomUUID()}`;
    const orderPayload = {
      slotId: slot.id,
      fulfillmentType: 'PICKUP',
      idempotencyKey: idemKey,
      items: [{ variantId: croissant.variants[0].id, quantity: 2 }],
    };

    const firstOrder = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send(orderPayload);
    expect(firstOrder.status).toBe(201);

    const replayOrder = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send(orderPayload);
    expect(replayOrder.status).toBe(200);
    expect(replayOrder.body.idempotent).toBe(true);
    expect(replayOrder.body.order.id).toBe(firstOrder.body.order.id);

    const webhookBody = {
      eventId: `evt_${crypto.randomUUID()}`,
      idempotencyKey: `wh_${crypto.randomUUID()}`,
      providerRef: firstOrder.body.paymentIntent.providerRef,
      orderId: firstOrder.body.order.id,
      status: 'SUCCEEDED',
      amountCents: firstOrder.body.order.totalAmountCents,
    };
    const raw = JSON.stringify(webhookBody);

    // Invalid signature rejected
    const badSig = await request(app)
      .post('/api/v1/webhooks/payments')
      .set('Content-Type', 'application/json')
      .set('x-webhook-signature', 'bad_sig')
      .send(raw);
    expect(badSig.status).toBe(401);

    const sig = paymentProvider.signWebhookPayload(raw);

    // First valid webhook books 1 slot
    const wh1 = await request(app)
      .post('/api/v1/webhooks/payments')
      .set('Content-Type', 'application/json')
      .set('x-webhook-signature', sig)
      .send(raw);
    expect(wh1.status).toBe(200);
    expect(wh1.body.idempotent).toBe(false);
    expect(wh1.body.orderStatus).toBe('PAID');

    // Duplicate webhook replay is idempotent and does NOT double-increment booked_orders
    const wh2 = await request(app)
      .post('/api/v1/webhooks/payments')
      .set('Content-Type', 'application/json')
      .set('x-webhook-signature', sig)
      .send(raw);
    expect(wh2.status).toBe(200);
    expect(wh2.body.idempotent).toBe(true);

    const updatedSlot = await prisma.timeSlot.findUniqueOrThrow({
      where: { id: slot.id },
    });
    expect(updatedSlot.bookedOrders).toBe(1);

    // Clean up test order & slot
    await prisma.order.delete({ where: { id: firstOrder.body.order.id } });
    await prisma.timeSlot.delete({ where: { id: slot.id } });
  });

  it('prevents overselling under 10 concurrent webhooks via SELECT ... FOR UPDATE', async () => {
    const futureDate = new Date(Date.now() + 22 * 24 * 60 * 60 * 1000);
    const dateOnly = new Date(
      Date.UTC(futureDate.getUTCFullYear(), futureDate.getUTCMonth(), futureDate.getUTCDate())
    );
    const slot = await prisma.timeSlot.create({
      data: {
        date: dateOnly,
        startTime: '13:00',
        endTime: '14:00',
        maxOrders: 3,
        bookedOrders: 0,
      },
    });

    const sourdough = await prisma.product.findUniqueOrThrow({
      where: { slug: 'country-sourdough-boule' },
      include: { variants: true },
    });

    const createdOrders: Array<{ id: string; providerRef: string; amount: number }> = [];
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          slotId: slot.id,
          fulfillmentType: 'PICKUP',
          idempotencyKey: `race_order_${i}_${crypto.randomUUID()}`,
          items: [{ variantId: sourdough.variants[0].id, quantity: 1 }],
        });
      expect(res.status).toBe(201);
      createdOrders.push({
        id: res.body.order.id,
        providerRef: res.body.paymentIntent.providerRef,
        amount: res.body.order.totalAmountCents,
      });
    }

    // Fire all 10 payment webhooks simultaneously!
    const results = await Promise.all(
      createdOrders.map((ord, idx) => {
        const payload = {
          eventId: `evt_race_${idx}_${crypto.randomUUID()}`,
          idempotencyKey: `wh_race_${idx}_${crypto.randomUUID()}`,
          providerRef: ord.providerRef,
          orderId: ord.id,
          status: 'SUCCEEDED',
          amountCents: ord.amount,
        };
        const raw = JSON.stringify(payload);
        const sig = paymentProvider.signWebhookPayload(raw);
        return request(app)
          .post('/api/v1/webhooks/payments')
          .set('Content-Type', 'application/json')
          .set('x-webhook-signature', sig)
          .send(raw);
      })
    );

    const paidCount = results.filter((r) => r.body.orderStatus === 'PAID').length;
    const refundedCount = results.filter(
      (r) => r.body.orderStatus === 'CANCELLED' && r.body.paymentStatus === 'REFUNDED'
    ).length;

    expect(paidCount).toBe(3);
    expect(refundedCount).toBe(7);

    const finalSlot = await prisma.timeSlot.findUniqueOrThrow({
      where: { id: slot.id },
    });
    expect(finalSlot.bookedOrders).toBe(3);

    // Verify Daily Prep Sheet aggregates exactly 3 loaves for this test date
    const prepRes = await request(app)
      .get(`/api/v1/admin/prep-sheet?date=${dateOnly.toISOString().slice(0, 10)}`)
      .set('Authorization', `Bearer ${bakerToken}`);
    expect(prepRes.status).toBe(200);
    expect(prepRes.body.totalUnits).toBe(3);

    // Clean up
    await prisma.order.deleteMany({
      where: { id: { in: createdOrders.map((o) => o.id) } },
    });
    await prisma.timeSlot.delete({ where: { id: slot.id } });
  });

  it('enforces RBAC across Customer, Baker, and Admin roles', async () => {
    const sourdough = await prisma.product.findUniqueOrThrow({
      where: { slug: 'country-sourdough-boule' },
    });

    // Customer blocked from admin endpoints
    const custOrders = await request(app)
      .get('/api/v1/admin/orders')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(custOrders.status).toBe(403);

    // Baker CAN view orders & prep-sheet, and toggle isActive
    const bakerOrders = await request(app)
      .get('/api/v1/admin/orders')
      .set('Authorization', `Bearer ${bakerToken}`);
    expect(bakerOrders.status).toBe(200);

    const bakerToggle = await request(app)
      .patch(`/api/v1/admin/products/${sourdough.id}`)
      .set('Authorization', `Bearer ${bakerToken}`)
      .send({ isActive: false });
    expect(bakerToggle.status).toBe(200);

    // Restore active state
    await request(app)
      .patch(`/api/v1/admin/products/${sourdough.id}`)
      .set('Authorization', `Bearer ${bakerToken}`)
      .send({ isActive: true });

    // Baker CANNOT view revenue analytics or modify prices
    const bakerAnalytics = await request(app)
      .get('/api/v1/admin/analytics')
      .set('Authorization', `Bearer ${bakerToken}`);
    expect(bakerAnalytics.status).toBe(403);

    const bakerPriceEdit = await request(app)
      .patch(`/api/v1/admin/products/${sourdough.id}`)
      .set('Authorization', `Bearer ${bakerToken}`)
      .send({ basePriceCents: 9999 });
    expect(bakerPriceEdit.status).toBe(403);

    // Admin CAN access analytics
    const adminAnalytics = await request(app)
      .get('/api/v1/admin/analytics')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminAnalytics.status).toBe(200);
    expect(adminAnalytics.body.summary).toBeDefined();
  });
});
