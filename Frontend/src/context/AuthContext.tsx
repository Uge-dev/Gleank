import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import {
  getCurrentSession,
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
} from "../services/auth.service";
import { ApiError } from "../lib/api";
import type { RegisterInput } from "../services/auth.service";
import { requestLocationAfterLogin } from "../services/location-presence.service";
import type { AuthUser, SellerStore, UserRole } from "../types/domain";

type AuthState = {
  user: AuthUser | null;
  store: SellerStore | null;
  isLoading: boolean;
};

type AuthContextValue = AuthState & {
  isAuthenticated: boolean;
  login: (input: { email: string; password: string }) => Promise<AuthUser>;
  register: (input: RegisterInput) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  hasRole: (...roles: UserRole[]) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const legacyUserKey = "gleank_user";
const lastPortalKey = "gleenc-last-portal";
const clientAuthStorageKeys = [
  legacyUserKey,
  "gleenc-rider-dashboard-state-v4",
];

function clearClientAuthStorage() {
  if (typeof window === "undefined") return;

  for (const key of clientAuthStorageKeys) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
}

function syncLegacyUser(user: AuthUser | null) {
  if (user) {
    localStorage.setItem(lastPortalKey, "user");
    sessionStorage.setItem("gleenc-current-portal", "user");
    localStorage.setItem(
      legacyUserKey,
      JSON.stringify({
        ...user,
        isLoggedIn: true,
      }),
    );
  } else {
    clearClientAuthStorage();
    if (sessionStorage.getItem("gleenc-current-portal") === "user") {
      sessionStorage.removeItem("gleenc-current-portal");
    }
  }

  window.dispatchEvent(new Event("gleank-auth-change"));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    store: null,
    isLoading: true,
  });

  const setSession = useCallback(
    (user: AuthUser | null, store: SellerStore | null) => {
      setState({ user, store, isLoading: false });
      syncLegacyUser(user);
    },
    [],
  );

  const refreshSession = useCallback(async () => {
    try {
      const session = await getCurrentSession();
      setSession(session.user, session.store);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setSession(null, null);
        return;
      }

      setState((current) => ({
        user: current.user,
        store: current.store,
        isLoading: false,
      }));
    }
  }, [setSession]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      isAuthenticated: Boolean(state.user),
      async login(input) {
        const session = await loginRequest(input);
        setSession(session.user, session.store);
        if (session.user.role !== "admin") {
          void requestLocationAfterLogin(session.user.role);
        }
        return session.user;
      },
      async register(input) {
        const session = await registerRequest(input);
        setSession(session.user, session.store);
        return session.user;
      },
      async logout() {
        try {
          await logoutRequest();
        } finally {
          setSession(null, null);
        }
      },
      refreshSession,
      hasRole(...roles) {
        return Boolean(state.user && roles.includes(state.user.role));
      },
    }),
    [refreshSession, setSession, state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
