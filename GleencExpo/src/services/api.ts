import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { AppConfig } from '@/constants/config';
import { createGleencApi, type Session } from './gleenc-api';

const sessionKey = 'gleenc.session';
const invalidationListeners = new Set<() => void>();
// Serialize keychain writes so a slow save cannot finish after logout deletion.
let writes: Promise<unknown> = Promise.resolve();
function enqueue(task: () => Promise<unknown>) {
  const operation = writes.then(task);
  writes = operation.catch(() => undefined);
  return operation;
}
function validSession(value: unknown): value is Session {
  if (!value || typeof value !== 'object') return false;
  const s = value as Partial<Session>;
  return s.tokenType === 'Bearer' &&
    typeof s.accessToken === 'string' && s.accessToken.length > 0 &&
    typeof s.refreshToken === 'string' && s.refreshToken.length > 0 &&
    typeof s.sessionId === 'string' && s.sessionId.length > 0 &&
    typeof s.accessExpiresAt === 'string' && Number.isFinite(Date.parse(s.accessExpiresAt)) &&
    typeof s.expiresAt === 'string' && Number.isFinite(Date.parse(s.expiresAt));
}
export async function readSession(): Promise<Session | null> {
  if (Platform.OS === 'web') return null; // Browser authentication uses HttpOnly cookies.
  await writes;
  const stored = await SecureStore.getItemAsync(sessionKey);
  if (!stored) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(stored); } catch { parsed = null; }
  if (!validSession(parsed)) {
    await clearStoredSession();
    return null;
  }
  return parsed;
}
async function saveStoredSession(session: Session) {
  if (Platform.OS === 'web') return;
  if (!validSession(session)) throw new Error('The server returned an invalid session.');
  await enqueue(() => SecureStore.setItemAsync(sessionKey, JSON.stringify(session), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  }));
}
export async function clearStoredSession() {
  try {
    if (Platform.OS !== 'web') await enqueue(() => SecureStore.deleteItemAsync(sessionKey));
  } finally {
    invalidationListeners.forEach(listener => listener());
  }
}
export function onSessionInvalidated(listener: () => void) {
  invalidationListeners.add(listener);
  return () => { invalidationListeners.delete(listener); };
}
export const api = createGleencApi({
  baseUrl: AppConfig.sharedApiBaseUrl,
  platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
  allowLocalHttp: __DEV__,
  getSession: readSession,
  saveSession: saveStoredSession,
  clearSession: clearStoredSession,
});
