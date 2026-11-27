import { z } from 'zod';
import { FulfillmentTypes, OrderStatuses, WasteReasons } from './enums';

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

const safeImageUrlSchema = z
  .string()
  .min(1)
  .max(500)
  .refine(
    (val) =>
      val.startsWith('/images/') ||
      val.startsWith('/uploads/') ||
      val.startsWith('https://') ||
      val.startsWith('http://localhost:') ||
      val.startsWith('http://127.0.0.1:'),
    {
      message: 'Image URL must be a relative /images/ or /uploads/ path or an https:// URL',
    }
  );

export const variantInputSchema = z.object({
  label: z.string().min(1).max(100),
  priceDeltaCents: z.number().int().min(-200000).max(2000000).default(0),
  isActive: z.boolean().optional().default(true),
});

export const createProductSchema = z.object({
  name: z.string().min(2).max(140),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase kebab-case')
    .min(2)
    .max(140)
    .optional(),
  description: z.string().min(4).max(1000),
  category: z.string().min(2).max(60),
  basePriceCents: z.number().int().min(50).max(2000000),
  leadTimeHours: z.number().int().min(0).max(168).default(2),
  isActive: z.boolean().optional().default(true),
  imageUrl: safeImageUrlSchema.default('/images/sourdough.svg'),
  tags: z.array(z.string().min(1).max(40)).max(8).optional().default([]),
  variants: z.array(variantInputSchema).min(1).max(20),
});

export const updateProductSchema = z.object({
  name: z.string().min(2).max(140).optional(),
  description: z.string().min(4).max(1000).optional(),
  category: z.string().min(2).max(60).optional(),
  basePriceCents: z.number().int().min(50).max(2000000).optional(),
  leadTimeHours: z.number().int().min(0).max(168).optional(),
  isActive: z.boolean().optional(),
  imageUrl: safeImageUrlSchema.optional(),
  tags: z.array(z.string().min(1).max(40)).max(8).optional(),
});

export const createVariantSchema = variantInputSchema;

export const updateVariantSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  priceDeltaCents: z.number().int().min(-200000).max(2000000).optional(),
  isActive: z.boolean().optional(),
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

export const createWasteLogSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1).max(500),
  reason: z.enum(WasteReasons).default('UNSOLD'),
  notes: z.string().max(250).optional(),
});

export const createStaffSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().min(2).max(120),
  phone: z.string().min(7).max(30).optional(),
  password: z.string().min(8).max(100),
  role: z.enum(['BAKER', 'ADMIN']).default('BAKER'),
});

export const updateStaffSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  phone: z.string().min(7).max(30).nullable().optional(),
  role: z.enum(['BAKER', 'ADMIN']).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).max(100).optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email().max(255),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  newPassword: z.string().min(8).max(100),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(20).max(200),
});
