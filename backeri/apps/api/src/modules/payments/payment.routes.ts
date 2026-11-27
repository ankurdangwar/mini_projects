import { Router } from 'express';
import { z } from 'zod';
import { paymentWebhookSchema } from '@backeri/shared';
import { env } from '../../config/env';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import { paymentProvider } from './payment.provider';
import { paymentService } from './payment.service';

const router = Router();

router.post(
  '/webhooks/payments',
  asyncHandler(async (req, res) => {
    const signature = String(req.headers['x-webhook-signature'] ?? '');
    const rawBody =
      (req as { rawBody?: string }).rawBody ?? JSON.stringify(req.body);

    if (!paymentProvider.verifyWebhookSignature(rawBody, signature)) {
      throw new AppError(401, 'Invalid webhook HMAC signature', 'INVALID_WEBHOOK_SIGNATURE');
    }

    const parsed = paymentWebhookSchema.parse(req.body);
    const result = await paymentService.handleWebhook(parsed);

    res.status(200).json({ received: true, ...result });
  })
);

const simulateSchema = z.object({
  mode: z.enum(['SUCCEEDED', 'FAILED', 'DUPLICATE']).default('SUCCEEDED'),
});

router.post(
  '/sandbox/payments/:providerRef/simulate',
  asyncHandler(async (req, res) => {
    if (env.PAYMENT_PROVIDER !== 'sandbox') {
      throw new AppError(
        403,
        'Sandbox simulator is disabled in production payment mode',
        'SANDBOX_DISABLED'
      );
    }

    const { mode } = simulateSchema.parse(req.body ?? {});
    const outcome = await paymentService.simulateSandboxPayment(
      String(req.params.providerRef),
      mode
    );
    res.status(200).json(outcome);
  })
);

export const paymentRoutes = router;
