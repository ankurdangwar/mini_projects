import crypto from 'crypto';
import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';
import { AppError } from '../../middleware/errorHandler';
import { realtimeService } from '../realtime/realtime.service';

const HOLD_DURATION_MS = 10 * 60 * 1000; // 10 minutes
const HOLD_KEY_PREFIX = 'slot:holds:';

// Atomic Redis Lua script for 10-minute checkout soft-lock:
// 1. Prunes expired holds
// 2. If holdId already present, refreshes its TTL
// 3. Otherwise verifies bookedOrders + activeHolds < maxOrders before inserting
const ACQUIRE_HOLD_LUA = `
local key = KEYS[1]
local nowMs = tonumber(ARGV[1])
local expiryMs = tonumber(ARGV[2])
local holdId = ARGV[3]
local booked = tonumber(ARGV[4])
local maxOrders = tonumber(ARGV[5])
local ttlSec = tonumber(ARGV[6])

redis.call('ZREMRANGEBYSCORE', key, '-inf', nowMs)

local existing = redis.call('ZSCORE', key, holdId)
if existing then
  redis.call('ZADD', key, expiryMs, holdId)
  redis.call('EXPIRE', key, ttlSec)
  return {1, redis.call('ZCARD', key)}
end

local activeHolds = redis.call('ZCARD', key)
if (booked + activeHolds) >= maxOrders then
  return {0, activeHolds}
end

redis.call('ZADD', key, expiryMs, holdId)
redis.call('EXPIRE', key, ttlSec)
return {1, activeHolds + 1}
`;

const COUNT_HOLDS_LUA = `
local key = KEYS[1]
local nowMs = tonumber(ARGV[1])
redis.call('ZREMRANGEBYSCORE', key, '-inf', nowMs)
return redis.call('ZCARD', key)
`;

export function getSlotStartDateTime(date: Date, startTime: string): Date {
  const datePart = date.toISOString().slice(0, 10);
  return new Date(`${datePart}T${startTime}:00.000Z`);
}

function holdKey(slotId: string): string {
  return `${HOLD_KEY_PREFIX}${slotId}`;
}

export const slotService = {
  async countActiveHolds(slotId: string): Promise<number> {
    try {
      const count = await redis.eval(
        COUNT_HOLDS_LUA,
        1,
        holdKey(slotId),
        String(Date.now())
      );
      return Number(count) || 0;
    } catch {
      return 0;
    }
  },

  async releaseHold(slotId: string, holdId: string): Promise<void> {
    try {
      await redis.zrem(holdKey(slotId), holdId);
    } catch {
      // Non-fatal cleanup
    }
  },

  async getAvailableSlots(params: {
    date?: string;
    leadTimeHours?: number;
    includeUnavailable?: boolean;
  }) {
    const leadTimeHours = Math.max(0, Number(params.leadTimeHours ?? 0));
    const minEligibleMs = Date.now() + leadTimeHours * 60 * 60 * 1000;

    let dateFilter: Record<string, unknown> | undefined;
    if (params.date) {
      const target = new Date(`${params.date}T00:00:00.000Z`);
      if (Number.isNaN(target.getTime())) {
        throw new AppError(400, 'Invalid date format. Expected YYYY-MM-DD', 'INVALID_DATE');
      }
      dateFilter = { equals: target };
    } else {
      const todayUtc = new Date();
      const startOfToday = new Date(
        Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), todayUtc.getUTCDate())
      );
      dateFilter = { gte: startOfToday };
    }

    const slots = await prisma.timeSlot.findMany({
      where: {
        date: dateFilter,
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });

    const enriched = await Promise.all(
      slots.map(async (slot) => {
        const activeHolds = await this.countActiveHolds(slot.id);
        const slotStart = getSlotStartDateTime(slot.date, slot.startTime);
        const meetsLeadTime = slotStart.getTime() >= minEligibleMs;
        const remainingSpots = Math.max(
          0,
          slot.maxOrders - slot.bookedOrders - activeHolds
        );
        const isAvailable =
          !slot.isClosed && meetsLeadTime && remainingSpots > 0;

        return {
          id: slot.id,
          date: slot.date.toISOString().slice(0, 10),
          startTime: slot.startTime,
          endTime: slot.endTime,
          maxOrders: slot.maxOrders,
          bookedOrders: slot.bookedOrders,
          activeHolds,
          remainingSpots,
          isClosed: slot.isClosed,
          meetsLeadTime,
          isAvailable,
        };
      })
    );

    if (params.includeUnavailable) {
      return enriched;
    }

    return enriched.filter((s) => s.meetsLeadTime && !s.isClosed);
  },

  async createSoftHold(slotId: string, existingHoldId?: string) {
    const slot = await prisma.timeSlot.findUnique({ where: { id: slotId } });
    if (!slot) {
      throw new AppError(404, 'Time slot not found', 'SLOT_NOT_FOUND');
    }
    if (slot.isClosed) {
      throw new AppError(409, 'This pickup/delivery window is closed', 'SLOT_CLOSED');
    }

    const holdId = existingHoldId || `hold_${crypto.randomUUID()}`;
    const nowMs = Date.now();
    const expiryMs = nowMs + HOLD_DURATION_MS;
    const ttlSec = Math.ceil(HOLD_DURATION_MS / 1000) + 30;

    const result = (await redis.eval(
      ACQUIRE_HOLD_LUA,
      1,
      holdKey(slotId),
      String(nowMs),
      String(expiryMs),
      holdId,
      String(slot.bookedOrders),
      String(slot.maxOrders),
      String(ttlSec)
    )) as [number, number];

    const acquired = Number(result[0]) === 1;
    const activeHolds = Number(result[1]);

    if (!acquired) {
      throw new AppError(
        409,
        'This time slot is currently full or reserved by other customers in checkout. Please choose another window.',
        'SLOT_CAPACITY_FULL'
      );
    }

    return {
      slotId,
      holdId,
      expiresAt: new Date(expiryMs).toISOString(),
      ttlSeconds: Math.floor(HOLD_DURATION_MS / 1000),
      remainingSpots: Math.max(0, slot.maxOrders - slot.bookedOrders - activeHolds),
    };
  },

  async updateSlot(
    slotId: string,
    data: { maxOrders?: number; isClosed?: boolean }
  ) {
    const current = await prisma.timeSlot.findUnique({ where: { id: slotId } });
    if (!current) {
      throw new AppError(404, 'Time slot not found', 'SLOT_NOT_FOUND');
    }

    if (data.maxOrders !== undefined && data.maxOrders < current.bookedOrders) {
      throw new AppError(
        400,
        `Cannot reduce capacity below already booked orders (${current.bookedOrders}).`,
        'INVALID_CAPACITY'
      );
    }

    const updated = await prisma.timeSlot.update({
      where: { id: slotId },
      data,
    });

    await realtimeService.publish('slot.updated', {
      slotId: updated.id,
      date: updated.date.toISOString().slice(0, 10),
      startTime: updated.startTime,
      maxOrders: updated.maxOrders,
      bookedOrders: updated.bookedOrders,
      isClosed: updated.isClosed,
    });

    return updated;
  },

  async blackoutDate(dateStr: string, isClosed: boolean) {
    const target = new Date(`${dateStr}T00:00:00.000Z`);
    if (Number.isNaN(target.getTime())) {
      throw new AppError(400, 'Invalid date format', 'INVALID_DATE');
    }

    const result = await prisma.timeSlot.updateMany({
      where: { date: target },
      data: { isClosed },
    });

    await realtimeService.publish('slot.updated', {
      date: dateStr,
      isClosed,
      blackout: true,
    });

    return { date: dateStr, isClosed, updatedCount: result.count };
  },
};
