export const UserRoles = ['CUSTOMER', 'BAKER', 'ADMIN'] as const;
export type UserRole = (typeof UserRoles)[number];

export const OrderStatuses = [
  'PENDING',
  'PAID',
  'BAKING',
  'READY',
  'COMPLETED',
  'CANCELLED',
] as const;
export type OrderStatus = (typeof OrderStatuses)[number];

export const FulfillmentTypes = ['PICKUP', 'DELIVERY'] as const;
export type FulfillmentType = (typeof FulfillmentTypes)[number];

export const PaymentStatuses = [
  'PENDING',
  'SUCCEEDED',
  'FAILED',
  'REFUNDED',
] as const;
export type PaymentStatus = (typeof PaymentStatuses)[number];

export const NotificationChannels = ['EMAIL', 'SMS'] as const;
export type NotificationChannel = (typeof NotificationChannels)[number];

export const WasteReasons = [
  'UNSOLD',
  'DAMAGED',
  'BURNT',
  'EXPIRED',
  'OTHER',
] as const;
export type WasteReason = (typeof WasteReasons)[number];
