'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { OrderItemCustomNotes } from '@/lib/types';

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

interface CartContextValue {
  items: CartItem[];
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  addItem: (item: Omit<CartItem, 'key'>) => void;
  updateQuantity: (key: string, quantity: number) => void;
  removeItem: (key: string) => void;
  clearCart: () => void;
  totalCount: number;
  subtotalCents: number;
  maxLeadTimeHours: number;
}

const STORAGE_KEY = 'backeri_cart_v1';
const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setItems(JSON.parse(saved) as CartItem[]);
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

  const addItem = useCallback((item: Omit<CartItem, 'key'>) => {
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
    setDrawerOpen(true);
  }, []);

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
