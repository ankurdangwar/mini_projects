import crypto from 'crypto';
import { env } from '../../config/env';

export interface PaymentIntentResult {
  provider: string;
  providerRef: string;
  clientSecret: string;
  amountCents: number;
}

export interface PaymentProvider {
  readonly name: string;
  createPaymentIntent(params: {
    orderId: string;
    amountCents: number;
    idempotencyKey: string;
  }): Promise<PaymentIntentResult>;
  signWebhookPayload(rawPayload: string): string;
  verifyWebhookSignature(rawPayload: string, signature: string): boolean;
  refundPayment(providerRef: string, amountCents: number): Promise<{ refundRef: string }>;
}

class SandboxPaymentProvider implements PaymentProvider {
  readonly name = 'sandbox';

  async createPaymentIntent(params: {
    orderId: string;
    amountCents: number;
    idempotencyKey: string;
  }): Promise<PaymentIntentResult> {
    const shortHash = crypto
      .createHash('sha256')
      .update(`${params.orderId}:${params.idempotencyKey}`)
      .digest('hex')
      .slice(0, 16);

    const providerRef = `pi_sandbox_${shortHash}`;
    const clientSecret = `${providerRef}_secret_${crypto.randomBytes(8).toString('hex')}`;

    return {
      provider: this.name,
      providerRef,
      clientSecret,
      amountCents: params.amountCents,
    };
  }

  signWebhookPayload(rawPayload: string): string {
    return crypto
      .createHmac('sha256', env.WEBHOOK_SECRET)
      .update(rawPayload)
      .digest('hex');
  }

  verifyWebhookSignature(rawPayload: string, signature: string): boolean {
    if (!signature) return false;
    const expected = this.signWebhookPayload(rawPayload);
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  }

  async refundPayment(
    providerRef: string,
    amountCents: number
  ): Promise<{ refundRef: string }> {
    const refundRef = `re_sandbox_${crypto.randomBytes(6).toString('hex')}`;
    if (env.NODE_ENV !== 'test') {
      console.log(
        `[SandboxPayment] Refunded ${amountCents} cents for ${providerRef} -> ${refundRef}`
      );
    }
    return { refundRef };
  }
}

export const paymentProvider: PaymentProvider = new SandboxPaymentProvider();
