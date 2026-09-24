'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  useState,
  type ReactNode,
} from 'react';

import type { Customer } from '@caffeinawa/types';

import {
  getCurrentCustomer,
  login as loginApi,
  type LoginInput,
  type LoginCustomer,
  type RegisterInput,
  register as registerApi,
} from '@/lib/api/auth';

const ACCESS_TOKEN_KEY = 'caffeinawa_access_token';

interface AuthContextValue {
  customer: LoginCustomer | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<Customer>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

let accessToken: string | null = null;
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);

  window.addEventListener('storage', callback);

  return () => {
    listeners.delete(callback);
    window.removeEventListener('storage', callback);
  };
}

function getSnapshot() {
  if (accessToken === null) {
    accessToken = window.localStorage.getItem(ACCESS_TOKEN_KEY);
  }

  return accessToken;
}

function getServerSnapshot() {
  return null;
}

function setAccessToken(token: string | null) {
  accessToken = token;

  if (token) {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
  } else {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  }

  listeners.forEach(listener => listener());
}

export function AuthProvider({ children }: AuthProviderProps) {
  const token = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const [customer, setCustomer] = useState<LoginCustomer | null>(null);

  const [sessionResolved, setSessionResolved] = useState(false);

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;

    getCurrentCustomer(token)
      .then(currentCustomer => {
        if (!cancelled) {
          setCustomer(currentCustomer);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAccessToken(null);
          setCustomer(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSessionResolved(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const login = useCallback(async (input: LoginInput) => {
    const response = await loginApi(input);

    setAccessToken(response.accessToken);
    setCustomer(response.customer);
    setSessionResolved(true);
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    return registerApi(input);
  }, []);

  const logout = useCallback(() => {
    setAccessToken(null);
    setCustomer(null);
    setSessionResolved(true);
  }, []);

  const isLoading = token !== null && !sessionResolved;

  const value = useMemo<AuthContextValue>(
    () => ({
      customer,
      accessToken: token,
      isLoading,
      isAuthenticated: customer !== null,
      login,
      register,
      logout,
    }),
    [customer, token, isLoading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
