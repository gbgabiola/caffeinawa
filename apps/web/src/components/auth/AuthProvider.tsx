'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import type { Customer } from '@caffeinawa/types';

import {
  AuthRequestError,
  getCurrentCustomer,
  login as loginApi,
  register as registerApi,
  updateCurrentCustomer,
  type LoginCustomer,
  type LoginInput,
  type RegisterInput,
  type UpdateCustomerInput,
} from '@/lib/api/auth';

const ACCESS_TOKEN_KEY = 'caffeinawa_access_token';
const PROFILE_UPDATED_KEY = 'caffeinawa_profile_updated';

interface AuthContextValue {
  customer: LoginCustomer | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  sessionError: string | null;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<Customer>;
  logout: () => void;
  updateCustomer: (input: UpdateCustomerInput) => Promise<void>;
  retrySession: () => void;
}

interface SessionState {
  token: string | null;
  customer: LoginCustomer | null;
  resolved: boolean;
}

const EMPTY_SESSION: SessionState = {
  token: null,
  customer: null,
  resolved: true,
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);

  function handleStorage(event: StorageEvent) {
    if (event.key === ACCESS_TOKEN_KEY || event.key === null) {
      callback();
    }
  }

  window.addEventListener('storage', handleStorage);

  return () => {
    listeners.delete(callback);
    window.removeEventListener('storage', handleStorage);
  };
}

function getSnapshot() {
  // Always read the current value, including changes from other tabs.
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

function getServerSnapshot() {
  return null;
}

function setAccessToken(token: string | null) {
  if (token) {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
  } else {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  }

  // Native storage events do not fire in the tab making the change.
  listeners.forEach(listener => listener());
}

let authHydrated = false;
const hydrationListeners = new Set<() => void>();

function subscribeHydration(callback: () => void) {
  hydrationListeners.add(callback);

  return () => {
    hydrationListeners.delete(callback);
  };
}

function getHydrationSnapshot() {
  return authHydrated;
}

function getServerHydrationSnapshot() {
  return false;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const token = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const isAuthHydrated = useSyncExternalStore(subscribeHydration, getHydrationSnapshot, getServerHydrationSnapshot);

  const [session, setSession] = useState<SessionState>(EMPTY_SESSION);
  const [profileRefreshVersion, setProfileRefreshVersion] = useState(0);
  const [sessionFailure, setSessionFailure] = useState<{
    token: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (authHydrated) return;

    authHydrated = true;

    hydrationListeners.forEach(listener => listener());
  }, []);

  useEffect(() => {
    function handleProfileUpdated(event: StorageEvent) {
      if (event.key !== PROFILE_UPDATED_KEY || event.newValue === null || token === null || getSnapshot() !== token) {
        return;
      }

      setProfileRefreshVersion(version => version + 1);
    }

    window.addEventListener('storage', handleProfileUpdated);

    return () => {
      window.removeEventListener('storage', handleProfileUpdated);
    };
  }, [token]);

  useEffect(() => {
    if (token === null) return;

    let cancelled = false;

    function isCurrentRequest() {
      return !cancelled && getSnapshot() === token;
    }

    getCurrentCustomer(token)
      .then(customer => {
        if (!isCurrentRequest()) return;

        setSession({
          token,
          customer,
          resolved: true,
        });

        setSessionFailure(null);
      })
      .catch(error => {
        if (!isCurrentRequest()) return;

        if (error instanceof AuthRequestError && error.status === 401) {
          setAccessToken(null);
          setSession(EMPTY_SESSION);
          setSessionFailure(null);
          return;
        }

        setSessionFailure({
          token,
          message: "We couldn't check your account. Please try again.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [token, profileRefreshVersion]);

  const retrySession = useCallback(() => {
    setSessionFailure(null);
    setProfileRefreshVersion(version => version + 1);
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const response = await loginApi(input);

    setAccessToken(response.accessToken);
    setSessionFailure(null);

    setSession({
      token: response.accessToken,
      customer: response.customer,
      resolved: true,
    });
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    return registerApi(input);
  }, []);

  const logout = useCallback(() => {
    setAccessToken(null);
    setSession(EMPTY_SESSION);
    setSessionFailure(null);
  }, []);

  const updateCustomer = useCallback(
    async (input: UpdateCustomerInput) => {
      if (!token) {
        throw new Error('Authentication required');
      }

      const updatedCustomer = await updateCurrentCustomer(token, input);

      // The active account may have changed while saving.
      if (getSnapshot() !== token) {
        return;
      }

      setSession(current =>
        current.token === token && current.customer
          ? {
              ...current,
              customer: {
                ...current.customer,
                ...updatedCustomer,
              },
            }
          : current,
      );

      try {
        window.localStorage.setItem(PROFILE_UPDATED_KEY, window.crypto.randomUUID());
      } catch {
        // The server save succeeded. A notification failure must
        // not report that the profile update itself failed.
      }
    },
    [token],
  );

  // Customer data belongs only to the token that loaded it.
  const customer = token !== null && session.token === token ? session.customer : null;

  const sessionResolved = token === null || (session.token === token && session.resolved);

  const isLoading = !isAuthHydrated || !sessionResolved;

  const sessionError = token !== null && sessionFailure?.token === token ? sessionFailure.message : null;

  const value = useMemo<AuthContextValue>(
    () => ({
      customer,
      accessToken: token,
      isLoading,
      isAuthenticated: customer !== null,
      sessionError,
      retrySession,
      login,
      register,
      logout,
      updateCustomer,
    }),
    [customer, token, isLoading, sessionError, retrySession, login, register, logout, updateCustomer],
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
