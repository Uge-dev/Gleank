import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { shouldUseApi, shouldUseMock } from '../config/env';
import { ApiClientError } from '../services/apiClient';
import { riderApi } from '../services/riderApi';
import { riderLocalStore } from '../services/riderLocalStore';
import type { Availability, Rider } from '../types';
import { requestLocationAfterLogin } from '../../services/location-presence.service';

interface AuthContextValue {
  rider: Rider | null;
  loading: boolean;
  apiConnected: boolean;
  login: (email: string, password: string) => Promise<Rider>;
  signup: (payload: Partial<Rider> & { password: string; identityDocument?: File | null; selfie?: File | null }) => Promise<Rider>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  updateAvailability: (availability: Availability) => Promise<void>;
  updateRiderLocally: (patch: Partial<Rider>) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function currentBrowserLocation() {
  return new Promise<{ lat: number; lng: number; accuracyMeters?: number }>(
    (resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Location access is required before going online."));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) =>
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracyMeters: position.coords.accuracy,
          }),
        () =>
          reject(
            new Error(
              "Enable location permission so sellers can see you for dispatch.",
            ),
          ),
        { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
      );
    },
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [rider, setRider] = useState<Rider | null>(() => (shouldUseMock() ? riderLocalStore.load().rider : null));
  const [loading, setLoading] = useState(() => shouldUseApi());
  const [apiConnected, setApiConnected] = useState(false);

  const refreshSession = useCallback(async () => {
    if (!shouldUseApi()) return;
    try {
      const response = await riderApi.session();
      setRider(response.rider);
      setApiConnected(true);
    } catch (error) {
      setApiConnected(false);
      if (error instanceof ApiClientError && [401, 403].includes(Number(error.status || 0))) {
        setRider(null);
      }
      throw error;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!shouldUseApi()) return;
    setLoading(true);
    refreshSession()
      .then(() => {
        if (!mounted) return;
        setApiConnected(true);
      })
      .catch(() => {
        if (!mounted) return;
        setApiConnected(false);
      })
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [refreshSession]);

  useEffect(() => {
    if (
      !shouldUseApi() ||
      !rider ||
      rider.availability !== "online"
    ) {
      return;
    }

    let active = true;

    async function sendHeartbeat() {
      try {
        const location = await currentBrowserLocation();
        if (active) await riderApi.updateLocation(location);
      } catch {
        // The verification center explains a missing or stale location to the rider.
      }
    }

    void sendHeartbeat();
    const heartbeat = window.setInterval(() => void sendHeartbeat(), 60_000);

    return () => {
      active = false;
      window.clearInterval(heartbeat);
    };
  }, [rider?.availability, rider?.id]);

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
          void requestLocationAfterLogin('rider');
          return response.rider;
        }
        if (shouldUseMock()) {
          const nextRider = riderLocalStore.login(email);
          setRider(nextRider);
          return nextRider;
        }
        throw new Error('Rider API is not configured. Set VITE_API_URL or VITE_GLEANK_API_URL before rider login.');
      } catch (error) {
        setApiConnected(false);
        throw error instanceof Error ? error : new Error('Rider login failed.');
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
          return response.rider;
        }
        if (shouldUseMock()) {
          const nextRider = riderLocalStore.signup(payload);
          setRider(nextRider);
          return nextRider;
        }
        throw new Error('Rider API is not configured. Set VITE_API_URL or VITE_GLEANK_API_URL before rider signup.');
      } catch (error) {
        setApiConnected(false);
        throw error instanceof Error ? error : new Error('Rider signup failed.');
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
    refreshSession,
    async updateAvailability(availability: Availability) {
      try {
        if (shouldUseApi()) {
          const currentLocation =
            availability === "online"
              ? await currentBrowserLocation()
              : undefined;
          const response = await riderApi.updateAvailability(
            availability,
            currentLocation,
          );
          setRider((current) => ({
            ...(current || response.rider),
            ...response.rider,
            email: response.rider.email || current?.email || '',
            profilePhoto: response.rider.profilePhoto || current?.profilePhoto || '',
          }));
          setApiConnected(true);
          return;
        }
        if (shouldUseMock()) {
          const nextRider = riderLocalStore.updateAvailability(availability);
          setRider(nextRider);
          return;
        }
        throw new Error('Rider API is not configured. Set VITE_API_URL or VITE_GLEANK_API_URL before changing availability.');
      } catch (error) {
        setApiConnected(false);
        throw error instanceof Error ? error : new Error('Availability update failed.');
      }
    },
    updateRiderLocally(patch: Partial<Rider>) {
      setRider((current) => (current ? { ...current, ...patch } : current));
    }
  }), [apiConnected, loading, refreshSession, rider]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
