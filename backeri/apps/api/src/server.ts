import { env } from './config/env';
import { prisma } from './config/prisma';
import { closeRedis } from './config/redis';
import { createApp } from './app';
import { realtimeService } from './modules/realtime/realtime.service';
import { uploadService } from './modules/uploads/upload.service';

async function start() {
  await uploadService.ensureDir();
  await realtimeService.init();

  const app = createApp();
  const server = app.listen(env.API_PORT, () => {
    console.log(`[Backeri API] Listening on http://localhost:${env.API_PORT}`);
    console.log(`[Backeri API] Payment provider: ${env.PAYMENT_PROVIDER}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n[Backeri API] Received ${signal}, shutting down gracefully...`);
    server.close(async () => {
      await closeRedis();
      await prisma.$disconnect();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((err) => {
  console.error('[Backeri API] Fatal startup error:', err);
  process.exit(1);
});
