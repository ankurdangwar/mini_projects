import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { prisma } from './config/prisma';
import { redis } from './config/redis';
import { errorHandler } from './middleware/errorHandler';
import { authRoutes } from './modules/auth/auth.routes';
import { catalogRoutes } from './modules/catalog/catalog.routes';
import { slotRoutes } from './modules/slots/slot.routes';
import { orderRoutes } from './modules/orders/order.routes';
import { paymentRoutes } from './modules/payments/payment.routes';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes';
import { realtimeRoutes } from './modules/realtime/realtime.routes';
import { uploadRoutes } from './modules/uploads/upload.routes';
import { uploadService } from './modules/uploads/upload.service';
import { jobRoutes } from './modules/jobs/job.routes';

export function createApp() {
  const app = express();

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(null, true);
        }
      },
      credentials: true,
    })
  );

  app.use(cookieParser());

  // Capture rawBody on JSON routes so webhook HMAC signature verification is exact
  app.use(
    express.json({
      limit: '2mb',
      verify: (req, _res, buf) => {
        (req as { rawBody?: string }).rawBody = buf.toString('utf8');
      },
    })
  );

  // Serve locally uploaded custom cake reference images
  app.use('/uploads', express.static(uploadService.getUploadsDir()));

  // Healthcheck
  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      const pong = await redis.ping();
      res.status(200).json({
        status: 'ok',
        db: 'connected',
        redis: pong === 'PONG' ? 'connected' : pong,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(503).json({
        status: 'degraded',
        error: err instanceof Error ? err.message : 'Healthcheck failed',
      });
    }
  });

  // Mount v1 API modules
  app.use('/api/v1', authRoutes);
  app.use('/api/v1', catalogRoutes);
  app.use('/api/v1', slotRoutes);
  app.use('/api/v1', orderRoutes);
  app.use('/api/v1', paymentRoutes);
  app.use('/api/v1', dashboardRoutes);
  app.use('/api/v1', realtimeRoutes);
  app.use('/api/v1', uploadRoutes);
  app.use('/api/v1', jobRoutes);

  app.use(errorHandler);

  return app;
}
