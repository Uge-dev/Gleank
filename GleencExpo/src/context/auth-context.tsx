import { requestAppleCredential } from '@/services/apple-auth.service';
import { requestGoogleCredential } from '@/services/google-auth.service';
import {
    createContext,
    useCallback,
    useEffect,
    useMemo,
    useState,
    useRef,
    type ReactNode,
} from 'react';

import * as AuthService from '@/services/auth.service';
import { onSessionInvalidated } from '@/services/api';
import { AppState } from 'react-native';
import { getApiErrorMessage } from '@/services/api-client';
import type {
    AuthPayload,
    AuthUser,
    LoginInput,
    RegisterInput,
    SellerStore,
} from '@/types';

type AuthContextValue = {
  user: AuthUser | null;
  store: SellerStore | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  sessionNotice: string;
  signIn: (input: LoginInput) => Promise<AuthPayload>;
  signUp: (input: RegisterInput) => Promise<AuthPayload>;
  signInWithGoogle: () => Promise<AuthPayload>;
  signInWithApple: () => Promise<AuthPayload>;
  signOut: () => Promise<void>;
  linkGoogle: (password:string) => Promise<void>;
  refreshSession: () => Promise<void>;
};

export const AuthContext =
  createContext<AuthContextValue | undefined>(
    undefined,
  );

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({
  children,
}: AuthProviderProps) {
  const generation = useRef(0);
  const [sessionNotice, setSessionNotice] = useState('');
  const [user, setUser] =
    useState<AuthUser | null>(null);

  const [store, setStore] =
    useState<SellerStore | null>(null);

  const [isLoading, setIsLoading] =
    useState(true);

  const applySession = useCallback(
    (session: AuthPayload | null) => {
      setUser(session?.user ?? null);
      setStore(session?.store ?? null);
    },
    [],
  );

  const refreshSession = useCallback(
    async () => {
      const current = generation.current;
      try {
        const session =
          await AuthService.getCurrentSession();

        if (current === generation.current) { applySession(session); setSessionNotice(''); }
      } catch (error) {
        if (current !== generation.current) return;
        const status = error && typeof error === 'object' && 'status' in error ? error.status : 0;
        if (status === 401) applySession(null);
        // A network failure must not delete a valid keychain session or sign out an active account.
        setSessionNotice(getApiErrorMessage(error));
      }
    },
    [applySession],
  );

  useEffect(() => onSessionInvalidated(() => {
    generation.current++;
    applySession(null);
  }), [applySession]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void refreshSession();
    });
    return () => subscription.remove();
  }, [refreshSession]);
  useEffect(() => {
    async function restoreSession() {
      setIsLoading(true);

      try {
        await refreshSession();
      } finally {
        setIsLoading(false);
      }
    }

    void restoreSession();
  }, [refreshSession]);

  const signIn = useCallback(
    async (input: LoginInput) => {
      const current = ++generation.current;
      const session =
        await AuthService.login(input);

      if (current !== generation.current) throw new Error('The account changed. Please try again.');
      applySession(session);
      setSessionNotice('');
      return session;
    },
    [applySession],
  );

  const signUp = useCallback(
    async (input: RegisterInput) => {
      const current = ++generation.current;
      const session =
        await AuthService.register(input);

      if (current !== generation.current) throw new Error('The account changed. Please try again.');
      applySession(session);
      setSessionNotice('');
      return session;
    },
    [applySession],
  );

  const authenticateGoogle=useCallback(async(link=false,password?:string)=>{
    const current=++generation.current;
    const credential=await requestGoogleCredential(link,password);
    if(current!==generation.current)throw new Error('The account changed. Please try again.');
    const session=await AuthService.exchangeGoogle(credential);
    if(current!==generation.current)throw new Error('The account changed. Please try again.');
    applySession(session);setSessionNotice('');return session;
  },[applySession]);
  const signInWithApple=useCallback(async()=>{
    const current=++generation.current,credential=await requestAppleCredential();
    if(current!==generation.current)throw new Error('The account changed. Please try again.');
    const session=await AuthService.exchangeIdentity(credential);
    if(current!==generation.current)throw new Error('The account changed. Please try again.');
    applySession(session);setSessionNotice('');return session;
  },[applySession]);
  const signInWithGoogle=useCallback(()=>authenticateGoogle(false),[authenticateGoogle]);
  const linkGoogle=useCallback(async(password:string)=>{await authenticateGoogle(true,password);},[authenticateGoogle]);

  const signOut = useCallback(async () => {
    const current = ++generation.current;
    applySession(null);
    try {
      await AuthService.logout();
    } finally {
      if (current === generation.current) applySession(null);
    }
  }, [applySession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      store,
      isLoading,
      isAuthenticated: Boolean(user),
      sessionNotice,
      signIn,
      signUp,
      signInWithGoogle,
      signInWithApple,
      linkGoogle,
      signOut,
      refreshSession,
    }),
    [
      isLoading,
      sessionNotice,
      refreshSession,
      signIn,
      signOut,
      signUp,
      signInWithGoogle,
      signInWithApple,
      linkGoogle,
      store,
      user,
    ],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
