import { env } from './config/env';
import { prisma } from './config/prisma';
import { closeRedis } from './config/redis';
import { realtimeService } from './modules/realtime/realtime.service';
import { uploadService } from './modules/uploads/upload.service';
import { jobsService } from './modules/jobs/job.queues';
import { createApp } from './app';

async function bootstrap() {
  await uploadService.ensureDir();
  await realtimeService.init();
  await jobsService.startWorkers({ runInitialChecks: true });

  const app = createApp();
  const server = app.listen(env.API_PORT, () => {
    console.log(
      `Backeri API listening on http://localhost:${env.API_PORT} (${env.NODE_ENV})`
    );
  });

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down gracefully...`);
    server.close(async () => {
      await Promise.allSettled([
        jobsService.closeJobs(),
        prisma.$disconnect(),
        closeRedis(),
      ]);
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('Failed to start Backeri API:', err);
  process.exit(1);
});
