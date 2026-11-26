import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';
import { AppError } from '../../middleware/errorHandler';
import { realtimeService } from '../realtime/realtime.service';
import type { UserRole } from '@backeri/shared';

const MENU_CACHE_KEY = 'backeri:menu:v1';
const MENU_CACHE_TTL_SECONDS = 60;

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
      data,
      include: { variants: true },
    });

    await this.invalidateMenuCache();
    await realtimeService.publish('catalog.updated', {
      productId: updated.id,
      isActive: updated.isActive,
      name: updated.name,
    });

    return updated;
  },

  async invalidateMenuCache(): Promise<void> {
    try {
      await redis.del(MENU_CACHE_KEY);
    } catch {
      // Ignore cache invalidation error
    }
  },
};
