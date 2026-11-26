import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth';
import { realtimeService } from './realtime.service';

const router = Router();

router.get(
  '/admin/events',
  authenticate,
  requireRole('BAKER', 'ADMIN'),
  (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    res.write(
      `event: connected\ndata: ${JSON.stringify({
        status: 'connected',
        user: req.user?.email,
        timestamp: new Date().toISOString(),
      })}\n\n`
    );

    const removeClient = realtimeService.addClient(res);

    const heartbeat = setInterval(() => {
      try {
        res.write(`: heartbeat ${Date.now()}\n\n`);
      } catch {
        clearInterval(heartbeat);
        removeClient();
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      removeClient();
      res.end();
    });
  }
);

export const realtimeRoutes = router;
