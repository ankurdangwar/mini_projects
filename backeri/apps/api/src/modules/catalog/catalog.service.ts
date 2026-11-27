import crypto from 'crypto';
import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';
import { AppError } from '../../middleware/errorHandler';
import { realtimeService } from '../realtime/realtime.service';
import type { UserRole } from '@backeri/shared';

const MENU_CACHE_KEY = 'backeri:menu:v1';
const MENU_CACHE_TTL_SECONDS = 60;

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return base || `item-${crypto.randomBytes(3).toString('hex')}`;
}

export const catalogService = {
  async getMenu(options?: { includeInactive?: boolean }) {
    const includeInactive = Boolean(options?.includeInactive);

    if (!includeInactive) {
      try {
        const cached = await redis.get(MENU_CACHE_KEY);
        if (cached) {
          return {
            ...(JSON.parse(cached) as Record<string, unknown>),
            cached: true,
          };
        }
      } catch {
        // Fallback to DB on cache error
      }
    }

    const products = await prisma.product.findMany({
      where: includeInactive ? undefined : {},
      include: {
        variants: {
          where: includeInactive ? undefined : { isActive: true },
          orderBy: { priceDeltaCents: 'asc' },
        },
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    const categories = Array.from(new Set(products.map((p) => p.category)));
    const payload = {
      categories,
      products,
      generatedAt: new Date().toISOString(),
    };

    if (!includeInactive) {
      try {
        await redis.set(
          MENU_CACHE_KEY,
          JSON.stringify(payload),
          'EX',
          MENU_CACHE_TTL_SECONDS
        );
      } catch {
        // Non-fatal cache write error
      }
    }

    return { ...payload, cached: false };
  },

  async getProductByIdOrSlug(idOrSlug: string) {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        idOrSlug
      );

    const product = await prisma.product.findFirst({
      where: isUuid ? { id: idOrSlug } : { slug: idOrSlug },
      include: {
        variants: {
          where: { isActive: true },
          orderBy: { priceDeltaCents: 'asc' },
        },
      },
    });

    if (!product) {
      throw new AppError(404, 'Product not found', 'PRODUCT_NOT_FOUND');
    }

    return product;
  },

  async createProduct(input: {
    name: string;
    slug?: string;
    description: string;
    category: string;
    basePriceCents: number;
    leadTimeHours: number;
    isActive: boolean;
    imageUrl: string;
    tags: string[];
    variants: Array<{
      label: string;
      priceDeltaCents: number;
      isActive?: boolean;
    }>;
  }) {
    // Reject duplicate variant labels in the same payload
    const normalizedLabels = input.variants.map((v) => v.label.trim().toLowerCase());
    if (new Set(normalizedLabels).size !== normalizedLabels.length) {
      throw new AppError(
        400,
        'Duplicate variant labels are not allowed on the same product.',
        'DUPLICATE_VARIANT'
      );
    }

    let slug = input.slug ? slugify(input.slug) : slugify(input.name);
    const existingSlug = await prisma.product.findUnique({ where: { slug } });
    if (existingSlug) {
      slug = `${slug}-${crypto.randomBytes(2).toString('hex')}`;
    }

    const created = await prisma.product.create({
      data: {
        name: input.name.trim(),
        slug,
        description: input.description.trim(),
        category: input.category.trim(),
        basePriceCents: input.basePriceCents,
        leadTimeHours: input.leadTimeHours,
        isActive: input.isActive,
        imageUrl: input.imageUrl,
        tags: input.tags.map((t) => t.trim()).filter(Boolean),
        variants: {
          create: input.variants.map((v) => ({
            label: v.label.trim(),
            priceDeltaCents: v.priceDeltaCents,
            isActive: v.isActive ?? true,
          })),
        },
      },
      include: {
        variants: { orderBy: { priceDeltaCents: 'asc' } },
      },
    });

    await this.invalidateMenuCache();
    await realtimeService.publish('catalog.updated', {
      action: 'created',
      productId: created.id,
      name: created.name,
    });

    return created;
  },

  async updateProduct(
    productId: string,
    data: {
      name?: string;
      description?: string;
      category?: string;
      basePriceCents?: number;
      leadTimeHours?: number;
      isActive?: boolean;
      imageUrl?: string;
      tags?: string[];
    },
    actorRole: UserRole
  ) {
    // Bakers may ONLY toggle isActive (mark item Sold Out / Available).
    // Pricing, lead time, and catalog metadata edits are restricted to Admins.
    if (actorRole === 'BAKER') {
      const forbiddenFields = Object.keys(data).filter(
        (k) => k !== 'isActive' && data[k as keyof typeof data] !== undefined
      );
      if (forbiddenFields.length > 0) {
        throw new AppError(
          403,
          `Bakers can only toggle item availability (Sold Out). Cannot edit: ${forbiddenFields.join(', ')}`,
          'FORBIDDEN'
        );
      }
    }

    const updated = await prisma.product.update({
      where: { id: productId },
      data: {
        ...data,
        name: data.name?.trim(),
        description: data.description?.trim(),
        category: data.category?.trim(),
        tags: data.tags?.map((t) => t.trim()).filter(Boolean),
      },
      include: {
        variants: { orderBy: { priceDeltaCents: 'asc' } },
      },
    });

    await this.invalidateMenuCache();
    await realtimeService.publish('catalog.updated', {
      action: 'updated',
      productId: updated.id,
      isActive: updated.isActive,
      name: updated.name,
    });

    return updated;
  },

  async deleteOrArchiveProduct(productId: string) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { variants: { select: { id: true } } },
    });

    if (!product) {
      throw new AppError(404, 'Product not found', 'PRODUCT_NOT_FOUND');
    }

    const variantIds = product.variants.map((v) => v.id);
    const referencedCount =
      variantIds.length > 0
        ? await prisma.orderItem.count({
            where: { variantId: { in: variantIds } },
          })
        : 0;

    if (referencedCount > 0) {
      const archived = await prisma.product.update({
        where: { id: productId },
        data: { isActive: false },
        include: { variants: { orderBy: { priceDeltaCents: 'asc' } } },
      });
      await this.invalidateMenuCache();
      await realtimeService.publish('catalog.updated', {
        action: 'archived',
        productId: archived.id,
      });
      return {
        deleted: false,
        archived: true,
        message:
          'Product has existing order history, so it was marked Sold Out (archived) instead of hard-deleted.',
        product: archived,
      };
    }

    await prisma.product.delete({ where: { id: productId } });
    await this.invalidateMenuCache();
    await realtimeService.publish('catalog.updated', {
      action: 'deleted',
      productId,
    });

    return {
      deleted: true,
      archived: false,
      message: 'Product permanently deleted.',
    };
  },

  async addVariant(
    productId: string,
    input: { label: string; priceDeltaCents: number; isActive?: boolean }
  ) {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      throw new AppError(404, 'Product not found', 'PRODUCT_NOT_FOUND');
    }

    const variant = await prisma.productVariant.create({
      data: {
        productId,
        label: input.label.trim(),
        priceDeltaCents: input.priceDeltaCents,
        isActive: input.isActive ?? true,
      },
    });

    await this.invalidateMenuCache();
    await realtimeService.publish('catalog.updated', {
      action: 'variant_added',
      productId,
      variantId: variant.id,
    });

    return variant;
  },

  async updateVariant(
    productId: string,
    variantId: string,
    data: { label?: string; priceDeltaCents?: number; isActive?: boolean }
  ) {
    const existing = await prisma.productVariant.findFirst({
      where: { id: variantId, productId },
    });
    if (!existing) {
      throw new AppError(404, 'Product variant not found', 'VARIANT_NOT_FOUND');
    }

    const updated = await prisma.productVariant.update({
      where: { id: variantId },
      data: {
        label: data.label?.trim(),
        priceDeltaCents: data.priceDeltaCents,
        isActive: data.isActive,
      },
    });

    await this.invalidateMenuCache();
    await realtimeService.publish('catalog.updated', {
      action: 'variant_updated',
      productId,
      variantId: updated.id,
    });

    return updated;
  },

  async deleteOrArchiveVariant(productId: string, variantId: string) {
    const variants = await prisma.productVariant.findMany({
      where: { productId },
    });

    const target = variants.find((v) => v.id === variantId);
    if (!target) {
      throw new AppError(404, 'Product variant not found', 'VARIANT_NOT_FOUND');
    }

    if (variants.length <= 1) {
      throw new AppError(
        400,
        'A product must keep at least one variant. Add another variant first or deactivate the product.',
        'LAST_VARIANT'
      );
    }

    const referencedCount = await prisma.orderItem.count({
      where: { variantId },
    });

    if (referencedCount > 0) {
      const archived = await prisma.productVariant.update({
        where: { id: variantId },
        data: { isActive: false },
      });
      await this.invalidateMenuCache();
      await realtimeService.publish('catalog.updated', {
        action: 'variant_archived',
        productId,
        variantId,
      });
      return {
        deleted: false,
        archived: true,
        message:
          'Variant has existing order history, so it was deactivated instead of hard-deleted.',
        variant: archived,
      };
    }

    await prisma.productVariant.delete({ where: { id: variantId } });
    await this.invalidateMenuCache();
    await realtimeService.publish('catalog.updated', {
      action: 'variant_deleted',
      productId,
      variantId,
    });

    return {
      deleted: true,
      archived: false,
      message: 'Variant permanently deleted.',
    };
  },

  async invalidateMenuCache(): Promise<void> {
    try {
      await redis.del(MENU_CACHE_KEY);
    } catch {
      // Ignore cache invalidation error
    }
  },
};
