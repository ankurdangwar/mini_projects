import { Prisma, WasteReason } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/errorHandler';

interface PrepRow {
  product_id: string;
  product_name: string;
  category: string;
  variant_id: string;
  variant_label: string;
  total_quantity: bigint | number;
  order_count: bigint | number;
}

interface PrepSlotRow {
  variant_id: string;
  start_time: string;
  end_time: string;
  quantity: bigint | number;
}

interface DailyRevenueRow {
  day: Date;
  revenue_cents: bigint | number;
  order_count: bigint | number;
}

interface TopProductRow {
  product_id: string;
  product_name: string;
  category: string;
  units_sold: bigint | number;
  revenue_cents: bigint | number;
}

interface PeakSlotRow {
  start_time: string;
  end_time: string;
  order_count: bigint | number;
}

interface WasteByReasonRow {
  reason: WasteReason;
  units: bigint | number;
  value_cents: bigint | number;
}

interface TopWastedRow {
  product_id: string;
  product_name: string;
  variant_label: string;
  units: bigint | number;
  value_cents: bigint | number;
}

export const dashboardService = {
  async getPrepSheet(dateStr: string) {
    const targetDate = new Date(`${dateStr}T00:00:00.000Z`);
    if (Number.isNaN(targetDate.getTime())) {
      throw new AppError(400, 'Invalid date format. Expected YYYY-MM-DD', 'INVALID_DATE');
    }

    const [groupedRows, slotBreakdownRows, statusCounts] = await Promise.all([
      prisma.$queryRaw<PrepRow[]>(
        Prisma.sql`
          SELECT
            p.id AS product_id,
            p.name AS product_name,
            p.category AS category,
            pv.id AS variant_id,
            pv.label AS variant_label,
            SUM(oi.quantity) AS total_quantity,
            COUNT(DISTINCT o.id) AS order_count
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
      ),
      prisma.$queryRaw<PrepSlotRow[]>(
        Prisma.sql`
          SELECT
            oi.variant_id,
            ts.start_time,
            ts.end_time,
            SUM(oi.quantity) AS quantity
          FROM order_items oi
          INNER JOIN orders o ON o.id = oi.order_id
          INNER JOIN time_slots ts ON ts.id = o.slot_id
          WHERE ts.date = ${targetDate}::date
            AND o.status IN ('PAID', 'BAKING', 'READY')
          GROUP BY oi.variant_id, ts.start_time, ts.end_time
          ORDER BY ts.start_time ASC
        `
      ),
      prisma.order.groupBy({
        by: ['status'],
        where: {
          slot: { date: targetDate },
          status: { in: ['PAID', 'BAKING', 'READY', 'COMPLETED'] },
        },
        _count: { id: true },
      }),
    ]);

    const slotsByVariant = new Map<
      string,
      Array<{ startTime: string; endTime: string; quantity: number }>
    >();

    for (const row of slotBreakdownRows) {
      const list = slotsByVariant.get(row.variant_id) ?? [];
      list.push({
        startTime: row.start_time,
        endTime: row.end_time,
        quantity: Number(row.quantity),
      });
      slotsByVariant.set(row.variant_id, list);
    }

    const items = groupedRows.map((row) => ({
      productId: row.product_id,
      productName: row.product_name,
      category: row.category,
      variantId: row.variant_id,
      variantLabel: row.variant_label,
      totalQuantity: Number(row.total_quantity),
      orderCount: Number(row.order_count),
      slotBreakdown: slotsByVariant.get(row.variant_id) ?? [],
    }));

    const totalUnits = items.reduce((acc, i) => acc + i.totalQuantity, 0);

    return {
      date: dateStr,
      totalUnits,
      distinctVariants: items.length,
      statusSummary: statusCounts.reduce<Record<string, number>>((acc, s) => {
        acc[s.status] = s._count.id;
        return acc;
      }, {}),
      items,
    };
  },

  async createWasteLog(
    loggedById: string,
    input: {
      date: string;
      variantId: string;
      quantity: number;
      reason: WasteReason;
      notes?: string;
    }
  ) {
    const targetDate = new Date(`${input.date}T00:00:00.000Z`);
    if (Number.isNaN(targetDate.getTime())) {
      throw new AppError(400, 'Invalid date format. Expected YYYY-MM-DD', 'INVALID_DATE');
    }

    const variant = await prisma.productVariant.findUnique({
      where: { id: input.variantId },
      include: { product: true },
    });
    if (!variant) {
      throw new AppError(404, 'Product variant not found', 'VARIANT_NOT_FOUND');
    }

    const unitCostCents = variant.product.basePriceCents + variant.priceDeltaCents;

    return prisma.wasteLog.create({
      data: {
        date: targetDate,
        variantId: variant.id,
        loggedById,
        quantity: input.quantity,
        unitCostCents,
        reason: input.reason,
        notes: input.notes?.trim() || undefined,
      },
      include: {
        variant: {
          include: {
            product: { select: { id: true, name: true, category: true } },
          },
        },
        loggedBy: { select: { id: true, name: true, role: true } },
      },
    });
  },

  async listWasteLogs(params: { date?: string; days?: number }) {
    const where: Prisma.WasteLogWhereInput = {};

    if (params.date) {
      const targetDate = new Date(`${params.date}T00:00:00.000Z`);
      if (Number.isNaN(targetDate.getTime())) {
        throw new AppError(400, 'Invalid date format', 'INVALID_DATE');
      }
      where.date = targetDate;
    } else {
      const safeDays = Math.min(90, Math.max(1, params.days ?? 14));
      const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
      where.date = { gte: since };
    }

    const logs = await prisma.wasteLog.findMany({
      where,
      include: {
        variant: {
          include: {
            product: { select: { id: true, name: true, category: true } },
          },
        },
        loggedBy: { select: { id: true, name: true, role: true } },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 150,
    });

    const totalUnits = logs.reduce((acc, l) => acc + l.quantity, 0);
    const totalValueCents = logs.reduce(
      (acc, l) => acc + l.quantity * l.unitCostCents,
      0
    );

    return {
      logs: logs.map((l) => ({
        ...l,
        date: l.date.toISOString().slice(0, 10),
        totalValueCents: l.quantity * l.unitCostCents,
      })),
      summary: {
        entryCount: logs.length,
        totalUnits,
        totalValueCents,
      },
    };
  },

  async deleteWasteLog(id: string) {
    await prisma.wasteLog.delete({ where: { id } });
    return { deleted: true };
  },

  async getAnalytics(days = 14) {
    const safeDays = Math.min(90, Math.max(1, days));
    const sinceDate = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);

    const [
      paidOrdersAgg,
      cancelledCount,
      totalNonPendingCount,
      soldUnitsAgg,
      dailyRevenue,
      topProducts,
      peakHours,
      wasteByReason,
      topWastedProducts,
    ] = await Promise.all([
      prisma.order.aggregate({
        where: {
          status: { in: ['PAID', 'BAKING', 'READY', 'COMPLETED'] },
          createdAt: { gte: sinceDate },
        },
        _sum: { totalAmountCents: true },
        _count: { id: true },
        _avg: { totalAmountCents: true },
      }),
      prisma.order.count({
        where: {
          status: 'CANCELLED',
          createdAt: { gte: sinceDate },
        },
      }),
      prisma.order.count({
        where: {
          status: { not: 'PENDING' },
          createdAt: { gte: sinceDate },
        },
      }),
      prisma.orderItem.aggregate({
        where: {
          order: {
            status: { in: ['PAID', 'BAKING', 'READY', 'COMPLETED'] },
            createdAt: { gte: sinceDate },
          },
        },
        _sum: { quantity: true },
      }),
      prisma.$queryRaw<DailyRevenueRow[]>(
        Prisma.sql`
          SELECT
            DATE_TRUNC('day', created_at) AS day,
            SUM(total_amount_cents) AS revenue_cents,
            COUNT(id) AS order_count
          FROM orders
          WHERE status IN ('PAID', 'BAKING', 'READY', 'COMPLETED')
            AND created_at >= ${sinceDate}
          GROUP BY DATE_TRUNC('day', created_at)
          ORDER BY day ASC
        `
      ),
      prisma.$queryRaw<TopProductRow[]>(
        Prisma.sql`
          SELECT
            p.id AS product_id,
            p.name AS product_name,
            p.category AS category,
            SUM(oi.quantity) AS units_sold,
            SUM(oi.quantity * oi.unit_price_cents) AS revenue_cents
          FROM order_items oi
          INNER JOIN orders o ON o.id = oi.order_id
          INNER JOIN product_variants pv ON pv.id = oi.variant_id
          INNER JOIN products p ON p.id = pv.product_id
          WHERE o.status IN ('PAID', 'BAKING', 'READY', 'COMPLETED')
            AND o.created_at >= ${sinceDate}
          GROUP BY p.id, p.name, p.category
          ORDER BY units_sold DESC, revenue_cents DESC
          LIMIT 8
        `
      ),
      prisma.$queryRaw<PeakSlotRow[]>(
        Prisma.sql`
          SELECT
            ts.start_time,
            ts.end_time,
            COUNT(o.id) AS order_count
          FROM orders o
          INNER JOIN time_slots ts ON ts.id = o.slot_id
          WHERE o.status IN ('PAID', 'BAKING', 'READY', 'COMPLETED')
            AND o.created_at >= ${sinceDate}
          GROUP BY ts.start_time, ts.end_time
          ORDER BY ts.start_time ASC
        `
      ),
      prisma.$queryRaw<WasteByReasonRow[]>(
        Prisma.sql`
          SELECT
            reason,
            SUM(quantity) AS units,
            SUM(quantity * unit_cost_cents) AS value_cents
          FROM waste_logs
          WHERE date >= ${sinceDate}::date
          GROUP BY reason
          ORDER BY units DESC
        `
      ),
      prisma.$queryRaw<TopWastedRow[]>(
        Prisma.sql`
          SELECT
            p.id AS product_id,
            p.name AS product_name,
            pv.label AS variant_label,
            SUM(w.quantity) AS units,
            SUM(w.quantity * w.unit_cost_cents) AS value_cents
          FROM waste_logs w
          INNER JOIN product_variants pv ON pv.id = w.variant_id
          INNER JOIN products p ON p.id = pv.product_id
          WHERE w.date >= ${sinceDate}::date
          GROUP BY p.id, p.name, pv.label
          ORDER BY units DESC, value_cents DESC
          LIMIT 6
        `
      ),
    ]);

    const totalRevenueCents = paidOrdersAgg._sum.totalAmountCents ?? 0;
    const paidOrderCount = paidOrdersAgg._count.id;
    const averageOrderValueCents = Math.round(paidOrdersAgg._avg.totalAmountCents ?? 0);
    const cancellationRatePct =
      totalNonPendingCount > 0
        ? Number(((cancelledCount / totalNonPendingCount) * 100).toFixed(1))
        : 0;

    const totalSoldUnits = soldUnitsAgg._sum.quantity ?? 0;
    const totalWastedUnits = wasteByReason.reduce((s, r) => s + Number(r.units), 0);
    const estimatedWasteValueCents = wasteByReason.reduce(
      (s, r) => s + Number(r.value_cents),
      0
    );
    const productionDenominator = totalSoldUnits + totalWastedUnits;
    const productionWasteRatePct =
      productionDenominator > 0
        ? Number(((totalWastedUnits / productionDenominator) * 100).toFixed(1))
        : 0;

    return {
      periodDays: safeDays,
      summary: {
        totalRevenueCents,
        paidOrderCount,
        averageOrderValueCents,
        cancelledOrderCount: cancelledCount,
        cancellationRatePct,
      },
      wasteSummary: {
        totalSoldUnits,
        totalWastedUnits,
        estimatedWasteValueCents,
        productionWasteRatePct,
        byReason: wasteByReason.map((r) => ({
          reason: r.reason,
          units: Number(r.units),
          valueCents: Number(r.value_cents),
        })),
        topWastedProducts: topWastedProducts.map((w) => ({
          productId: w.product_id,
          productName: w.product_name,
          variantLabel: w.variant_label,
          units: Number(w.units),
          valueCents: Number(w.value_cents),
        })),
      },
      dailyRevenue: dailyRevenue.map((r) => ({
        date: r.day.toISOString().slice(0, 10),
        revenueCents: Number(r.revenue_cents),
        orderCount: Number(r.order_count),
      })),
      topProducts: topProducts.map((p) => ({
        productId: p.product_id,
        productName: p.product_name,
        category: p.category,
        unitsSold: Number(p.units_sold),
        revenueCents: Number(p.revenue_cents),
      })),
      peakWindows: peakHours.map((h) => ({
        startTime: h.start_time,
        endTime: h.end_time,
        orderCount: Number(h.order_count),
      })),
    };
  },

  async getRecentNotifications(limit = 40) {
    return prisma.notificationLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, Math.max(1, limit)),
      include: {
        order: {
          select: { orderNumber: true, status: true },
        },
      },
    });
  },
};
