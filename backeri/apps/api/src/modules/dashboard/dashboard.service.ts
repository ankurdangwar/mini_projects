import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/errorHandler';

interface PrepSheetRawRow {
  product_id: string;
  product_name: string;
  category: string;
  variant_id: string;
  variant_label: string;
  total_quantity: bigint | number;
  order_count: bigint | number;
}

interface PrepSlotBreakdownRow {
  variant_id: string;
  start_time: string;
  end_time: string;
  quantity: bigint | number;
}

export const dashboardService = {
  async getPrepSheet(dateStr?: string) {
    const resolvedDate =
      dateStr ??
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const targetDate = new Date(`${resolvedDate}T00:00:00.000Z`);
    if (Number.isNaN(targetDate.getTime())) {
      throw new AppError(400, 'Invalid date format. Expected YYYY-MM-DD', 'INVALID_DATE');
    }

    // Core grouped SQL aggregation: SUM(quantity) GROUP BY product_id, variant_id
    const rows = await prisma.$queryRaw<PrepSheetRawRow[]>(
      Prisma.sql`
        SELECT
          p.id AS product_id,
          p.name AS product_name,
          p.category AS category,
          pv.id AS variant_id,
          pv.label AS variant_label,
          SUM(oi.quantity)::int AS total_quantity,
          COUNT(DISTINCT o.id)::int AS order_count
        FROM order_items oi
        INNER JOIN orders o ON o.id = oi.order_id
        INNER JOIN time_slots ts ON ts.id = o.slot_id
        INNER JOIN product_variants pv ON pv.id = oi.variant_id
        INNER JOIN products p ON p.id = pv.product_id
        WHERE ts.date = ${targetDate}::date
          AND o.status IN ('PAID', 'BAKING', 'READY')
        GROUP BY p.id, p.name, p.category, pv.id, pv.label
        ORDER BY p.category ASC, p.name ASC, pv.label ASC
      `
    );

    // Slot-level breakdown so bakers know what must come out of the oven for 8am vs 2pm
    const slotRows = await prisma.$queryRaw<PrepSlotBreakdownRow[]>(
      Prisma.sql`
        SELECT
          oi.variant_id,
          ts.start_time,
          ts.end_time,
          SUM(oi.quantity)::int AS quantity
        FROM order_items oi
        INNER JOIN orders o ON o.id = oi.order_id
        INNER JOIN time_slots ts ON ts.id = o.slot_id
        WHERE ts.date = ${targetDate}::date
          AND o.status IN ('PAID', 'BAKING', 'READY')
        GROUP BY oi.variant_id, ts.start_time, ts.end_time
        ORDER BY ts.start_time ASC
      `
    );

    // Custom notes & cake inscriptions for that day's bake
    const customOrders = await prisma.order.findMany({
      where: {
        slot: { date: targetDate },
        status: { in: ['PAID', 'BAKING', 'READY'] },
      },
      include: {
        slot: true,
        items: {
          include: {
            variant: { include: { product: true } },
          },
        },
      },
      orderBy: { slot: { startTime: 'asc' } },
    });

    const customDecorations = customOrders.flatMap((o) =>
      o.items
        .filter((i) => {
          const notes = i.customNotes as Record<string, unknown> | null;
          return (
            notes &&
            (notes.inscription || notes.dietaryNotes || notes.referenceImageUrl)
          );
        })
        .map((i) => ({
          orderNumber: o.orderNumber,
          slotWindow: `${o.slot.startTime}–${o.slot.endTime}`,
          productName: i.variant.product.name,
          variantLabel: i.variant.label,
          quantity: i.quantity,
          customNotes: i.customNotes,
        }))
    );

    const slotMap = new Map<
      string,
      Array<{ startTime: string; endTime: string; quantity: number }>
    >();
    for (const r of slotRows) {
      const list = slotMap.get(r.variant_id) ?? [];
      list.push({
        startTime: r.start_time,
        endTime: r.end_time,
        quantity: Number(r.quantity),
      });
      slotMap.set(r.variant_id, list);
    }

    const items = rows.map((r) => ({
      productId: r.product_id,
      productName: r.product_name,
      category: r.category,
      variantId: r.variant_id,
      variantLabel: r.variant_label,
      totalQuantity: Number(r.total_quantity),
      orderCount: Number(r.order_count),
      bySlot: slotMap.get(r.variant_id) ?? [],
    }));

    const totalUnits = items.reduce((sum, i) => sum + i.totalQuantity, 0);

    return {
      date: resolvedDate,
      totalOrders: customOrders.length,
      totalUnits,
      items,
      customDecorations,
    };
  },

  async getAnalytics(days = 14) {
    const safeDays = Math.min(90, Math.max(1, days));
    const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);

    const orders = await prisma.order.findMany({
      where: {
        createdAt: { gte: since },
        status: { not: 'PENDING' },
      },
      include: {
        slot: true,
        items: {
          include: {
            variant: { include: { product: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const activeOrders = orders.filter((o) => o.status !== 'CANCELLED');
    const cancelledOrders = orders.filter((o) => o.status === 'CANCELLED');

    const totalRevenueCents = activeOrders.reduce(
      (sum, o) => sum + o.totalAmountCents,
      0
    );
    const cancelledValueCents = cancelledOrders.reduce(
      (sum, o) => sum + o.totalAmountCents,
      0
    );
    const totalOrderCount = activeOrders.length;
    const averageOrderValueCents =
      totalOrderCount > 0 ? Math.round(totalRevenueCents / totalOrderCount) : 0;
    const cancellationRatePercent =
      orders.length > 0
        ? Number(((cancelledOrders.length / orders.length) * 100).toFixed(1))
        : 0;

    // Daily revenue series (by pickup slot date)
    const dailyMap = new Map<string, { date: string; revenueCents: number; orders: number }>();
    for (const o of activeOrders) {
      const key = o.slot.date.toISOString().slice(0, 10);
      const entry = dailyMap.get(key) ?? { date: key, revenueCents: 0, orders: 0 };
      entry.revenueCents += o.totalAmountCents;
      entry.orders += 1;
      dailyMap.set(key, entry);
    }

    // Top selling products
    const productMap = new Map<
      string,
      { productId: string; name: string; category: string; unitsSold: number; revenueCents: number }
    >();
    for (const o of activeOrders) {
      for (const item of o.items) {
        const p = item.variant.product;
        const entry = productMap.get(p.id) ?? {
          productId: p.id,
          name: p.name,
          category: p.category,
          unitsSold: 0,
          revenueCents: 0,
        };
        entry.unitsSold += item.quantity;
        entry.revenueCents += item.unitPriceCents * item.quantity;
        productMap.set(p.id, entry);
      }
    }

    // Peak pickup hours
    const hourMap = new Map<string, { window: string; orders: number }>();
    for (const o of activeOrders) {
      const window = `${o.slot.startTime}–${o.slot.endTime}`;
      const entry = hourMap.get(window) ?? { window, orders: 0 };
      entry.orders += 1;
      hourMap.set(window, entry);
    }

    return {
      rangeDays: safeDays,
      summary: {
        totalRevenueCents,
        totalOrders: totalOrderCount,
        averageOrderValueCents,
        cancelledOrders: cancelledOrders.length,
        cancelledValueCents,
        cancellationRatePercent,
      },
      revenueByDate: Array.from(dailyMap.values()).sort((a, b) =>
        a.date.localeCompare(b.date)
      ),
      topProducts: Array.from(productMap.values())
        .sort((a, b) => b.revenueCents - a.revenueCents)
        .slice(0, 8),
      peakPickupHours: Array.from(hourMap.values()).sort((a, b) =>
        a.window.localeCompare(b.window)
      ),
    };
  },

  async getNotificationLogs(limit = 50) {
    return prisma.notificationLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(200, Math.max(1, limit)),
      include: {
        order: { select: { orderNumber: true, status: true } },
      },
    });
  },
};
