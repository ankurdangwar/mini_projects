import type { OrderStatus, UserRole } from './enums';

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['PAID', 'CANCELLED'],
  PAID: ['BAKING', 'CANCELLED'],
  BAKING: ['READY', 'CANCELLED'],
  READY: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransitionOrderStatus(
  from: OrderStatus,
  to: OrderStatus,
  actorRole: UserRole | 'SYSTEM'
): { allowed: boolean; reason?: string } {
  if (from === to) {
    return { allowed: false, reason: `Order is already in ${to} status.` };
  }

  const validNext = ALLOWED_TRANSITIONS[from] ?? [];
  if (!validNext.includes(to)) {
    return {
      allowed: false,
      reason: `Cannot transition order from ${from} to ${to}.`,
    };
  }

  if (to === 'PAID' && actorRole !== 'SYSTEM') {
    return {
      allowed: false,
      reason: 'Orders can only transition to PAID via verified payment webhook.',
    };
  }

  if (to === 'CANCELLED' && actorRole !== 'ADMIN' && actorRole !== 'SYSTEM') {
    return {
      allowed: false,
      reason: 'Only admins or system refunds can cancel an order.',
    };
  }

  return { allowed: true };
}

export function getNextKitchenStatus(current: OrderStatus): OrderStatus | null {
  switch (current) {
    case 'PAID':
      return 'BAKING';
    case 'BAKING':
      return 'READY';
    case 'READY':
      return 'COMPLETED';
    default:
      return null;
  }
}
