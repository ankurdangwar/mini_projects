import { z } from 'zod';
import { FulfillmentTypes, OrderStatuses } from './enums';

export const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(6).max(100),
  name: z.string().min(1).max(120),
  phone: z.string().min(7).max(30).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const customNotesSchema = z
  .object({
    inscription: z.string().max(120).optional(),
    dietaryNotes: z.string().max(250).optional(),
    referenceImageUrl: z.string().url().or(z.string().startsWith('/')).optional(),
  })
  .optional();

export const deliveryAddressSchema = z.object({
  line1: z.string().min(3).max(200),
  line2: z.string().max(200).optional(),
  city: z.string().min(2).max(100),
  postalCode: z.string().min(3).max(20),
  instructions: z.string().max(250).optional(),
});

export const createOrderSchema = z
  .object({
    slotId: z.string().uuid(),
    holdId: z.string().min(4).max(120).optional(),
    fulfillmentType: z.enum(FulfillmentTypes),
    deliveryAddress: deliveryAddressSchema.optional(),
    idempotencyKey: z.string().min(8).max(128),
    items: z
      .array(
        z.object({
          variantId: z.string().uuid(),
          quantity: z.number().int().min(1).max(50),
          customNotes: customNotesSchema,
        })
      )
      .min(1)
      .max(30),
  })
  .refine(
    (data) =>
      data.fulfillmentType !== 'DELIVERY' || Boolean(data.deliveryAddress),
    {
      message: 'Delivery address is required for DELIVERY orders',
      path: ['deliveryAddress'],
    }
  );

export const updateOrderStatusSchema = z.object({
  status: z.enum(OrderStatuses),
  reason: z.string().max(250).optional(),
});

export const updateSlotSchema = z.object({
  maxOrders: z.number().int().min(0).max(500).optional(),
  isClosed: z.boolean().optional(),
});

export const blackoutDateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isClosed: z.boolean().default(true),
});

export const updateProductSchema = z.object({
  name: z.string().min(2).max(140).optional(),
  description: z.string().max(1000).optional(),
  category: z.string().min(2).max(60).optional(),
  basePriceCents: z.number().int().min(50).max(500000).optional(),
  leadTimeHours: z.number().int().min(0).max(168).optional(),
  isActive: z.boolean().optional(),
  imageUrl: z.string().min(1).max(500).optional(),
});

export const presignUploadSchema = z.object({
  filename: z.string().min(1).max(200),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  sizeBytes: z.number().int().min(1).max(5 * 1024 * 1024),
});

export const paymentWebhookSchema = z.object({
  eventId: z.string().min(4).max(128),
  idempotencyKey: z.string().min(8).max(128),
  providerRef: z.string().min(4).max(128),
  orderId: z.string().uuid(),
  status: z.enum(['SUCCEEDED', 'FAILED']),
  amountCents: z.number().int().min(0),
});
