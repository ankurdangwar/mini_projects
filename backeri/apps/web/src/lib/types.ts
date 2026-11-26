import type { FulfillmentType, OrderStatus, PaymentStatus, UserRole } from '@backeri/shared';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: UserRole;
  createdAt?: string;
}

export interface ProductVariantDTO {
  id: string;
  productId: string;
  label: string;
  priceDeltaCents: number;
  isActive: boolean;
}

export interface ProductDTO {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  basePriceCents: number;
  leadTimeHours: number;
  isActive: boolean;
  imageUrl: string;
  tags: string[];
  variants: ProductVariantDTO[];
}

export interface MenuResponse {
  categories: string[];
  products: ProductDTO[];
  cached?: boolean;
  generatedAt: string;
}

export interface TimeSlotDTO {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  maxOrders: number;
  bookedOrders: number;
  activeHolds: number;
  remainingSpots: number;
  isClosed: boolean;
  meetsLeadTime: boolean;
  isAvailable: boolean;
}

export interface OrderItemCustomNotes {
  inscription?: string;
  dietaryNotes?: string;
  referenceImageUrl?: string;
}

export interface OrderDTO {
  id: string;
  orderNumber: string;
  userId: string;
  slotId: string;
  status: OrderStatus;
  totalAmountCents: number;
  fulfillmentType: FulfillmentType;
  deliveryAddress?: {
    line1: string;
    line2?: string;
    city: string;
    postalCode: string;
    instructions?: string;
  } | null;
  cancelReason?: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
  };
  slot: {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    maxOrders: number;
    bookedOrders: number;
  };
  items: Array<{
    id: string;
    quantity: number;
    unitPriceCents: number;
    customNotes?: OrderItemCustomNotes | null;
    variant: {
      id: string;
      label: string;
      product: {
        id: string;
        name: string;
        slug: string;
        category: string;
        imageUrl: string;
        leadTimeHours: number;
      };
    };
  }>;
  payments: Array<{
    id: string;
    provider: string;
    providerRef: string;
    amountCents: number;
    status: PaymentStatus;
  }>;
}

export interface PrepSheetResponse {
  date: string;
  totalUnits: number;
  distinctVariants: number;
  statusSummary: Record<string, number>;
  items: Array<{
    productId: string;
    productName: string;
    category: string;
    variantId: string;
    variantLabel: string;
    totalQuantity: number;
    orderCount: number;
    slotBreakdown: Array<{
      startTime: string;
      endTime: string;
      quantity: number;
    }>;
  }>;
}

export interface AnalyticsResponse {
  periodDays: number;
  summary: {
    totalRevenueCents: number;
    paidOrderCount: number;
    averageOrderValueCents: number;
    cancelledOrderCount: number;
    cancellationRatePct: number;
  };
  dailyRevenue: Array<{
    date: string;
    revenueCents: number;
    orderCount: number;
  }>;
  topProducts: Array<{
    productId: string;
    productName: string;
    category: string;
    unitsSold: number;
    revenueCents: number;
  }>;
  peakWindows: Array<{
    startTime: string;
    endTime: string;
    orderCount: number;
  }>;
}

export interface NotificationLogDTO {
  id: string;
  orderId: string | null;
  channel: 'EMAIL' | 'SMS';
  recipient: string;
  subject: string | null;
  body: string;
  status: string;
  createdAt: string;
  order?: {
    orderNumber: string;
    status: OrderStatus;
  } | null;
}
