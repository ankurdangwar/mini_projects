'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import type { UserProfile } from '@/lib/types';

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
  login: (email: string, password: string) => Promise<UserProfile>;
  register: (input: {
    email: string;
    password: string;
    name: string;
    phone?: string;
  }) => Promise<UserProfile>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiFetch<{ user: UserProfile }>('/api/v1/auth/me');
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiFetch<{ user: UserProfile }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(
    async (input: {
      email: string;
      password: string;
      name: string;
      phone?: string;
    }) => {
      const data = await apiFetch<{ user: UserProfile }>(
        '/api/v1/auth/register',
        {
          method: 'POST',
          body: JSON.stringify(input),
        }
      );
      setUser(data.user);
      return data.user;
    },
    []
  );

  const logout = useCallback(async () => {
    await apiFetch('/api/v1/auth/logout', { method: 'POST' });
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, refreshUser, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
