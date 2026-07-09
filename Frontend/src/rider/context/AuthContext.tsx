import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { shouldUseApi } from '../config/env';
import { riderApi } from '../services/riderApi';
import { riderLocalStore } from '../services/riderLocalStore';
import type { Availability, Rider } from '../types';

interface AuthContextValue {
  rider: Rider | null;
  loading: boolean;
  apiConnected: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (payload: Partial<Rider> & { password: string }) => Promise<void>;
  logout: () => Promise<void>;
  updateAvailability: (availability: Availability) => Promise<void>;
  updateRiderLocally: (patch: Partial<Rider>) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [rider, setRider] = useState<Rider | null>(() => riderLocalStore.load().rider);
  const [loading, setLoading] = useState(false);
  const [apiConnected, setApiConnected] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (!shouldUseApi()) return;
    setLoading(true);
    riderApi.session()
      .then((response) => {
        if (!mounted) return;
        setRider(response.rider);
        setApiConnected(true);
      })
      .catch(() => {
        if (!mounted) return;
        setApiConnected(false);
        setRider(riderLocalStore.load().rider);
      })
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    rider,
    loading,
    apiConnected,
    async login(email: string, password: string) {
      if (!email || !password) throw new Error('Email and password are required.');
      setLoading(true);
      try {
        if (shouldUseApi()) {
          const response = await riderApi.login(email, password);
          setRider(response.rider);
          setApiConnected(true);
          return;
        }
        const nextRider = riderLocalStore.login(email);
        setRider(nextRider);
      } catch (error) {
        setApiConnected(false);
        if (shouldUseApi()) {
          throw error instanceof Error ? error : new Error('Rider login failed.');
        }
        const nextRider = riderLocalStore.login(email);
        setRider(nextRider);
      } finally {
        setLoading(false);
      }
    },
    async signup(payload) {
      setLoading(true);
      try {
        if (shouldUseApi()) {
          const response = await riderApi.signup(payload);
          setRider(response.rider);
          setApiConnected(true);
          return;
        }
        const nextRider = riderLocalStore.signup(payload);
        setRider(nextRider);
      } catch (error) {
        setApiConnected(false);
        if (shouldUseApi()) {
          throw error instanceof Error ? error : new Error('Rider signup failed.');
        }
        const nextRider = riderLocalStore.signup(payload);
        setRider(nextRider);
      } finally {
        setLoading(false);
      }
    },
    async logout() {
      if (shouldUseApi()) {
        await riderApi.logout().catch(() => undefined);
      }
      setRider(null);
      setApiConnected(false);
    },
    async updateAvailability(availability: Availability) {
      setLoading(true);
      try {
        if (shouldUseApi()) {
          const response = await riderApi.updateAvailability(availability);
          setRider((current) => ({
            ...(current || response.rider),
            ...response.rider,
            email: response.rider.email || current?.email || '',
            profilePhoto: response.rider.profilePhoto || current?.profilePhoto || '',
          }));
          setApiConnected(true);
          return;
        }
        const nextRider = riderLocalStore.updateAvailability(availability);
        setRider(nextRider);
      } catch {
        setApiConnected(false);
        const nextRider = riderLocalStore.updateAvailability(availability);
        setRider(nextRider);
      } finally {
        setLoading(false);
      }
    },
    updateRiderLocally(patch: Partial<Rider>) {
      setRider((current) => (current ? { ...current, ...patch } : current));
    }
  }), [apiConnected, loading, rider]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
