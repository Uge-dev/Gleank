import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
const operations = new Map<string, Promise<{
    key: string;
    finish: () => Promise<void>;
}>>();
/** Persist only a request key and input digest, never payment credentials or tokens. */
export async function pendingKey(ownerId: string, scope: string, input: unknown) {
    const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, JSON.stringify(input));
    const slot = `gleenc:request:v2:${ownerId}:${scope}:${digest}`;
    const running = operations.get(slot);
    if (running)
        return running;
    const task = (async () => {
        const existing = await AsyncStorage.getItem(slot);
        if (existing && /^[a-f0-9-]{20,100}$/.test(existing))
            return { key: existing, finish: () => AsyncStorage.removeItem(slot) };
        const key = Array.from(Crypto.getRandomBytes(24)).map(v => v.toString(16).padStart(2, '0')).join('');
        await AsyncStorage.setItem(slot, key);
        return { key, finish: () => AsyncStorage.removeItem(slot) };
    })();
    operations.set(slot, task);
    try {
        return await task;
    }
    finally {
        operations.delete(slot);
    }
}
