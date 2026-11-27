import { describe, expect, it } from 'vitest';
import {
  canTransitionOrderStatus,
  createOrderSchema,
  formatMoney,
  formatSlotWindow,
  getNextKitchenStatus,
} from '@backeri/shared';
import { paymentProvider } from '../src/modules/payments/payment.provider';
import { uploadService } from '../src/modules/uploads/upload.service';

describe('Backeri Domain Unit Tests (Zero External Dependencies)', () => {
  it('enforces order status state machine & role permissions', () => {
    // Only SYSTEM webhook can transition PENDING -> PAID
    expect(canTransitionOrderStatus('PENDING', 'PAID', 'ADMIN').allowed).toBe(false);
    expect(canTransitionOrderStatus('PENDING', 'PAID', 'SYSTEM').allowed).toBe(true);

    // Baker can advance kitchen flow
    expect(canTransitionOrderStatus('PAID', 'BAKING', 'BAKER').allowed).toBe(true);
    expect(canTransitionOrderStatus('BAKING', 'READY', 'BAKER').allowed).toBe(true);
    expect(canTransitionOrderStatus('READY', 'COMPLETED', 'BAKER').allowed).toBe(true);

    // Baker cannot skip stages or cancel orders
    expect(canTransitionOrderStatus('PAID', 'READY', 'BAKER').allowed).toBe(false);
    expect(canTransitionOrderStatus('PAID', 'CANCELLED', 'BAKER').allowed).toBe(false);

    // Admin can cancel an active order
    expect(canTransitionOrderStatus('PAID', 'CANCELLED', 'ADMIN').allowed).toBe(true);

    // Completed orders are terminal
    expect(canTransitionOrderStatus('COMPLETED', 'CANCELLED', 'ADMIN').allowed).toBe(false);

    expect(getNextKitchenStatus('PAID')).toBe('BAKING');
    expect(getNextKitchenStatus('BAKING')).toBe('READY');
    expect(getNextKitchenStatus('READY')).toBe('COMPLETED');
    expect(getNextKitchenStatus('COMPLETED')).toBeNull();
  });

  it('validates checkout order payload rules via Zod', () => {
    const base = {
      slotId: '11111111-1111-4111-8111-111111111111',
      fulfillmentType: 'DELIVERY' as const,
      idempotencyKey: 'idem_12345678',
      items: [
        {
          variantId: '22222222-2222-4222-8222-222222222222',
          quantity: 1,
        },
      ],
    };

    // Missing deliveryAddress on DELIVERY fails
    expect(createOrderSchema.safeParse(base).success).toBe(false);

    // Valid DELIVERY with address passes
    expect(
      createOrderSchema.safeParse({
        ...base,
        deliveryAddress: {
          line1: '123 Sourdough Ln',
          city: 'San Francisco',
          postalCode: '94110',
        },
      }).success
    ).toBe(true);

    // PICKUP without address passes
    expect(
      createOrderSchema.safeParse({
        ...base,
        fulfillmentType: 'PICKUP',
      }).success
    ).toBe(true);
  });

  it('signs and verifies HMAC payment webhooks securely', () => {
    const payload = JSON.stringify({ orderId: 'abc', status: 'SUCCEEDED', amountCents: 5400 });
    const sig = paymentProvider.signWebhookPayload(payload);

    expect(paymentProvider.verifyWebhookSignature(payload, sig)).toBe(true);
    expect(paymentProvider.verifyWebhookSignature(payload + ' ', sig)).toBe(false);
    expect(paymentProvider.verifyWebhookSignature(payload, 'tampered')).toBe(false);
  });

  it('generates pre-signed upload URLs with expiration and signature', () => {
    const presigned = uploadService.createPresignedUrl({
      filename: 'birthday cake inspo.png',
      contentType: 'image/png',
      sizeBytes: 245000,
    });

    expect(presigned.method).toBe('PUT');
    expect(presigned.uploadUrl).toContain('sig=');
    expect(presigned.uploadUrl).toContain('exp=');
    expect(presigned.publicUrl).toContain('/uploads/');
    expect(presigned.objectKey.endsWith('.png')).toBe(true);
  });

  it('formats currency and slot windows cleanly', () => {
    expect(formatMoney(45000)).toBe('₹450');
    expect(formatMoney(5450, 'USD')).toBe('$54.50');
    expect(formatSlotWindow('08:00', '10:00')).toBe('8:00 AM – 10:00 AM');
    expect(formatSlotWindow('14:00', '16:00')).toBe('2:00 PM – 4:00 PM');
  });
});
