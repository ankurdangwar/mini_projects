'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { formatSlotWindow } from '@backeri/shared';
import { apiFetch } from '@/lib/api';
import type { OrderItemCustomNotes, TimeSlotDTO } from '@/lib/types';

export interface CartItem {
  key: string;
  productId: string;
  productName: string;
  productImage: string;
  leadTimeHours: number;
  variantId: string;
  variantLabel: string;
  unitPriceCents: number;
  quantity: number;
  customNotes?: OrderItemCustomNotes;
}

export interface DeliveryZoneInfo {
  pincode: string;
  area: string;
  eligible: boolean;
  etaLabel: string;
}

const KNOWN_PINCODES: Record<string, { area: string; etaLabel: string }> = {
  '560038': { area: 'Indiranagar', etaLabel: '25–35 mins' },
  '560034': { area: 'Koramangala', etaLabel: '30–40 mins' },
  '560001': { area: 'MG Road', etaLabel: '25–35 mins' },
  '560102': { area: 'HSR Layout', etaLabel: '35–45 mins' },
  '400050': { area: 'Bandra West', etaLabel: '25–35 mins' },
  '110001': { area: 'Connaught Place', etaLabel: '30–40 mins' },
};

export function resolvePincode(raw: string): DeliveryZoneInfo {
  const clean = raw.replace(/\D/g, '').slice(0, 6);
  if (clean.length !== 6) {
    return {
      pincode: clean,
      area: 'Enter 6-digit pincode',
      eligible: false,
      etaLabel: 'Unavailable',
    };
  }
  const known = KNOWN_PINCODES[clean];
  if (known) {
    return {
      pincode: clean,
      area: known.area,
      eligible: true,
      etaLabel: known.etaLabel,
    };
  }
  // Treat any valid 6-digit pincode starting with 1-8 as neighborhood-eligible in demo mode
  const eligible = /^[1-8]\d{5}$/.test(clean);
  return {
    pincode: clean,
    area: eligible ? 'Neighborhood Zone' : 'Outside Delivery Radius',
    eligible,
    etaLabel: eligible ? '35–45 mins' : 'Pickup Only',
  };
}

interface CartContextValue {
  items: CartItem[];
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  addItem: (
    item: Omit<CartItem, 'key'>,
    options?: { openDrawer?: boolean }
  ) => void;
  updateQuantity: (key: string, quantity: number) => void;
  removeItem: (key: string) => void;
  clearCart: () => void;
  getProductQuantity: (productId: string) => number;
  getDefaultVariantItem: (variantId: string) => CartItem | undefined;
  totalCount: number;
  subtotalCents: number;
  maxLeadTimeHours: number;
  // Persistent Delivery / Pickup Bar State
  fulfillmentMode: 'DELIVERY' | 'PICKUP';
  setFulfillmentMode: (mode: 'DELIVERY' | 'PICKUP') => void;
  deliveryZone: DeliveryZoneInfo;
  setPincode: (pincode: string) => DeliveryZoneInfo;
  earliestSlotLabel: string;
}

const STORAGE_KEY = 'backeri_cart_v1';
const FULFILLMENT_STORAGE_KEY = 'backeri_fulfillment_v1';
const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [fulfillmentMode, setFulfillmentMode] = useState<'DELIVERY' | 'PICKUP'>(
    'DELIVERY'
  );
  const [deliveryZone, setDeliveryZone] = useState<DeliveryZoneInfo>(() =>
    resolvePincode('560038')
  );
  const [earliestSlotLabel, setEarliestSlotLabel] = useState<string>(
    'Ready in 30 mins'
  );

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setItems(JSON.parse(saved) as CartItem[]);

      const savedFulfillment = window.localStorage.getItem(
        FULFILLMENT_STORAGE_KEY
      );
      if (savedFulfillment) {
        const parsed = JSON.parse(savedFulfillment) as {
          mode?: 'DELIVERY' | 'PICKUP';
          pincode?: string;
        };
        if (parsed.mode === 'PICKUP' || parsed.mode === 'DELIVERY') {
          setFulfillmentMode(parsed.mode);
        }
        if (parsed.pincode) {
          setDeliveryZone(resolvePincode(parsed.pincode));
        }
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // ignore storage errors
    }
  }, [items]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        FULFILLMENT_STORAGE_KEY,
        JSON.stringify({ mode: fulfillmentMode, pincode: deliveryZone.pincode })
      );
    } catch {
      // ignore storage errors
    }
  }, [fulfillmentMode, deliveryZone.pincode]);

  const setPincode = useCallback((raw: string) => {
    const zone = resolvePincode(raw);
    setDeliveryZone(zone);
    return zone;
  }, []);

  const addItem = useCallback(
    (item: Omit<CartItem, 'key'>, options?: { openDrawer?: boolean }) => {
      const notesKey = JSON.stringify(item.customNotes ?? {});
      const key = `${item.variantId}::${notesKey}`;

      setItems((prev) => {
        const existing = prev.find((i) => i.key === key);
        if (existing) {
          return prev.map((i) =>
            i.key === key ? { ...i, quantity: i.quantity + item.quantity } : i
          );
        }
        return [...prev, { ...item, key }];
      });
      if (options?.openDrawer) {
        setDrawerOpen(true);
      }
    },
    []
  );

  const updateQuantity = useCallback((key: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((i) => i.key !== key));
      return;
    }
    setItems((prev) =>
      prev.map((i) => (i.key === key ? { ...i, quantity } : i))
    );
  }, []);

  const removeItem = useCallback((key: string) => {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const getProductQuantity = useCallback(
    (productId: string) =>
      items
        .filter((i) => i.productId === productId)
        .reduce((sum, i) => sum + i.quantity, 0),
    [items]
  );

  const getDefaultVariantItem = useCallback(
    (variantId: string) =>
      items.find(
        (i) => i.variantId === variantId && !i.customNotes
      ),
    [items]
  );

  const summary = useMemo(() => {
    const totalCount = items.reduce((sum, i) => sum + i.quantity, 0);
    const subtotalCents = items.reduce(
      (sum, i) => sum + i.unitPriceCents * i.quantity,
      0
    );
    const maxLeadTimeHours = items.reduce(
      (max, i) => Math.max(max, i.leadTimeHours),
      0
    );
    return { totalCount, subtotalCents, maxLeadTimeHours };
  }, [items]);

  // Fetch live earliest eligible slot whenever cart lead time changes
  useEffect(() => {
    let active = true;
    if (summary.maxLeadTimeHours === 0) {
      setEarliestSlotLabel(
        fulfillmentMode === 'PICKUP'
          ? 'Pickup in 20 mins'
          : `Delivery in ${deliveryZone.etaLabel}`
      );
      return;
    }

    apiFetch<{ slots: TimeSlotDTO[] }>(
      `/api/v1/slots?lead_time=${summary.maxLeadTimeHours}`
    )
      .then((res) => {
        if (!active) return;
        const firstOpen = res.slots.find((s) => s.isAvailable);
        if (!firstOpen) {
          setEarliestSlotLabel(`${summary.maxLeadTimeHours}h prep required`);
          return;
        }
        const todayIso = new Date().toISOString().slice(0, 10);
        const dayPrefix =
          firstOpen.date === todayIso
            ? 'Today'
            : new Date(`${firstOpen.date}T12:00:00Z`).toLocaleDateString(
                'en-US',
                { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }
              );
        setEarliestSlotLabel(
          `${dayPrefix}, ${formatSlotWindow(firstOpen.startTime, firstOpen.endTime).split(' – ')[0]}`
        );
      })
      .catch(() => {
        if (active) {
          setEarliestSlotLabel(`Earliest: +${summary.maxLeadTimeHours}h slot`);
        }
      });

    return () => {
      active = false;
    };
  }, [summary.maxLeadTimeHours, fulfillmentMode, deliveryZone.etaLabel]);

  return (
    <CartContext.Provider
      value={{
        items,
        drawerOpen,
        setDrawerOpen,
        addItem,
        updateQuantity,
        removeItem,
        clearCart,
        getProductQuantity,
        getDefaultVariantItem,
        fulfillmentMode,
        setFulfillmentMode,
        deliveryZone,
        setPincode,
        earliestSlotLabel,
        ...summary,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart must be used inside CartProvider');
  }
  return ctx;
}
