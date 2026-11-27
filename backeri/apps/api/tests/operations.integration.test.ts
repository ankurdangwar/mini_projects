import crypto from 'crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/config/prisma';
import { closeRedis, redis } from '../src/config/redis';
import { authUserCacheKey } from '../src/middleware/auth';
import { jobsService } from '../src/modules/jobs/job.queues';

const app = createApp();

let adminToken = '';
let bakerToken = '';
let adminId = '';

async function login(email: string, password = 'password123') {
  return request(app).post('/api/v1/auth/login').send({ email, password });
}

describe('Operations Suite — Board Search, Waste Logging, Staff Mgmt & Auth Flows', () => {
  beforeAll(async () => {
    const adminRes = await login('admin@backeri.local');
    expect(adminRes.status).toBe(200);
    adminToken = adminRes.body.token;
    adminId = adminRes.body.user.id;

    const bakerRes = await login('baker@backeri.local');
    expect(bakerRes.status).toBe(200);
    bakerToken = bakerRes.body.token;
  });

  afterAll(async () => {
    await Promise.allSettled([
      jobsService.closeJobs(),
      prisma.$disconnect(),
      closeRedis(),
    ]);
  });

  it('filters admin order board by search query (order # / customer) and fulfillment type', async () => {
    const byNumber = await request(app)
      .get('/api/v1/admin/orders?q=BK-1001')
      .set('Authorization', `Bearer ${bakerToken}`);
    expect(byNumber.status).toBe(200);
    expect(
      (byNumber.body.orders as Array<{ orderNumber: string }>).some(
        (o) => o.orderNumber === 'BK-1001'
      )
    ).toBe(true);

    const deliveryOnly = await request(app)
      .get('/api/v1/admin/orders?fulfillmentType=DELIVERY')
      .set('Authorization', `Bearer ${bakerToken}`);
    expect(deliveryOnly.status).toBe(200);
    for (const o of deliveryOnly.body.orders as Array<{ fulfillmentType: string }>) {
      expect(o.fulfillmentType).toBe('DELIVERY');
    }
  });

  it('lets Bakers log end-of-day waste, reflects it in Admin analytics, and restricts delete to Admin', async () => {
    const croissant = await prisma.product.findUniqueOrThrow({
      where: { slug: 'cultured-butter-croissant' },
      include: { variants: true },
    });

    const today = new Date().toISOString().slice(0, 10);

    const logRes = await request(app)
      .post('/api/v1/admin/waste')
      .set('Authorization', `Bearer ${bakerToken}`)
      .send({
        date: today,
        variantId: croissant.variants[0].id,
        quantity: 4,
        reason: 'UNSOLD',
        notes: 'Rainy afternoon slowdown',
      });
    expect(logRes.status).toBe(201);
    const wasteId = logRes.body.wasteLog.id as string;

    try {
      const listRes = await request(app)
        .get(`/api/v1/admin/waste?date=${today}`)
        .set('Authorization', `Bearer ${bakerToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.summary.totalUnits).toBeGreaterThanOrEqual(4);

      // Baker cannot delete waste logs
      const bakerDel = await request(app)
        .delete(`/api/v1/admin/waste/${wasteId}`)
        .set('Authorization', `Bearer ${bakerToken}`);
      expect(bakerDel.status).toBe(403);

      // Admin analytics includes true production-vs-waste metrics
      const analyticsRes = await request(app)
        .get('/api/v1/admin/analytics?days=14')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(analyticsRes.status).toBe(200);
      expect(analyticsRes.body.wasteSummary.totalWastedUnits).toBeGreaterThanOrEqual(4);
      expect(analyticsRes.body.wasteSummary.estimatedWasteValueCents).toBeGreaterThan(0);
    } finally {
      const adminDel = await request(app)
        .delete(`/api/v1/admin/waste/${wasteId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminDel.status).toBe(200);
    }
  });

  it('supports Admin staff management and immediately revokes disabled baker tokens', async () => {
    // Baker cannot manage staff
    const bakerList = await request(app)
      .get('/api/v1/admin/staff')
      .set('Authorization', `Bearer ${bakerToken}`);
    expect(bakerList.status).toBe(403);

    // Admin cannot disable self
    const selfDisable = await request(app)
      .patch(`/api/v1/admin/staff/${adminId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });
    expect(selfDisable.status).toBe(400);

    const tempEmail = `temp.baker.${crypto.randomBytes(4).toString('hex')}@backeri.local`;
    const created = await request(app)
      .post('/api/v1/admin/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Temporary Pastry Baker',
        email: tempEmail,
        password: 'TempPassword123',
        role: 'BAKER',
      });
    expect(created.status).toBe(201);
    const staffId = created.body.staff.id as string;

    try {
      // New baker signs in and accesses kitchen board -> populates Redis auth cache (60s TTL)
      const bakerLogin = await login(tempEmail, 'TempPassword123');
      expect(bakerLogin.status).toBe(200);
      const tempToken = bakerLogin.body.token as string;

      const boardOk = await request(app)
        .get('/api/v1/admin/orders')
        .set('Authorization', `Bearer ${tempToken}`);
      expect(boardOk.status).toBe(200);

      const cacheKey = authUserCacheKey(staffId);
      const cachedRaw = await redis.get(cacheKey);
      expect(cachedRaw).not.toBeNull();
      const cachedUser = JSON.parse(cachedRaw!) as { isActive: boolean; role: string };
      expect(cachedUser.isActive).toBe(true);
      expect(cachedUser.role).toBe('BAKER');
      const ttl = await redis.ttl(cacheKey);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60);

      // Admin promotes baker to ADMIN -> cache evicted & role syncs immediately on existing JWT
      const promoteRes = await request(app)
        .patch(`/api/v1/admin/staff/${staffId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'ADMIN' });
      expect(promoteRes.status).toBe(200);
      expect(await redis.get(cacheKey)).toBeNull();

      const analyticsNowAllowed = await request(app)
        .get('/api/v1/admin/analytics')
        .set('Authorization', `Bearer ${tempToken}`);
      expect(analyticsNowAllowed.status).toBe(200);

      // Admin disables the staff member -> cache evicted immediately
      const disableRes = await request(app)
        .patch(`/api/v1/admin/staff/${staffId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false });
      expect(disableRes.status).toBe(200);
      expect(await redis.get(cacheKey)).toBeNull();

      // Existing JWT is immediately blocked on next request
      const boardBlocked = await request(app)
        .get('/api/v1/admin/orders')
        .set('Authorization', `Bearer ${tempToken}`);
      expect(boardBlocked.status).toBe(401);
      expect(boardBlocked.body.error.code).toBe('ACCOUNT_DISABLED');

      // Fresh login is also rejected
      const reloginBlocked = await login(tempEmail, 'TempPassword123');
      expect(reloginBlocked.status).toBe(403);
    } finally {
      await redis.del(authUserCacheKey(staffId));
      await prisma.user.delete({ where: { id: staffId } });
    }
  });

  it('supports customer email verification and one-time password reset flows', async () => {
    const email = `verify.cust.${crypto.randomBytes(4).toString('hex')}@backeri.local`;

    const reg = await request(app).post('/api/v1/auth/register').send({
      name: 'Clara Customer',
      email,
      password: 'OldPassword123',
    });
    expect(reg.status).toBe(201);
    expect(reg.body.user.emailVerified).toBe(false);
    const verifyToken = reg.body.verificationToken as string;
    const userId = reg.body.user.id as string;

    try {
      // Verify email once -> succeeds
      const verifyOk = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ token: verifyToken });
      expect(verifyOk.status).toBe(200);
      expect(verifyOk.body.verified).toBe(true);

      // Replaying single-use verification token -> rejected
      const verifyReplay = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ token: verifyToken });
      expect(verifyReplay.status).toBe(400);

      // Request password reset
      const forgot = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email });
      expect(forgot.status).toBe(200);
      const resetToken = forgot.body.devResetToken as string;
      expect(resetToken).toBeTruthy();

      // Complete password reset
      const reset = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: resetToken, newPassword: 'NewSecurePassword99' });
      expect(reset.status).toBe(200);
      expect(reset.body.reset).toBe(true);

      // Old password rejected, new password succeeds
      const oldLogin = await login(email, 'OldPassword123');
      expect(oldLogin.status).toBe(401);

      const newLogin = await login(email, 'NewSecurePassword99');
      expect(newLogin.status).toBe(200);
    } finally {
      await prisma.user.delete({ where: { id: userId } });
    }
  });
});
