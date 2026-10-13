import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { integer, naira, text } from '@/features/marketplace/domain';
export function secureId(prefix = 'LOCAL') {
    if (!/^[A-Z][A-Z0-9_-]{0,20}$/.test(prefix))
        throw new Error('Invalid record prefix.');
    if (Platform.OS !== 'web' && !requireOptionalNativeModule('ExpoCrypto'))
        throw new Error('Install the new development build containing expo-crypto to complete this action.');
    const crypto = require('expo-crypto') as typeof import('expo-crypto');
    return prefix + '-' + Array.from(crypto.getRandomBytes(16), n => n.toString(16).padStart(2, '0')).join('').toUpperCase();
}
export function required(value: string, label: string, max = 200) {
    const clean = text(value, max);
    if (!clean)
        throw new Error('Enter ' + label + '.');
    return clean;
}
export function phone(value: string) {
    const clean = required(value, 'a phone number', 25);
    if (!/^\+?[0-9 ()-]{7,20}$/.test(clean))
        throw new Error('Enter a valid phone number.');
    return clean;
}
export function safeAmount(value: string) {
    const amount = naira(value);
    if (!amount)
        throw new Error('Enter an amount greater than zero.');
    return amount;
}
export function list<T>(value: unknown, limit: number): T[] {
    if (!Array.isArray(value) || value.length > limit)
        throw new Error('Invalid saved record list.');
    return value;
}
export function timestamp(value: number) {
    return integer(value, 1, Number.MAX_SAFE_INTEGER, 'time');
}
export function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}
export function explain(error: unknown) {
    return error instanceof Error ? error.message : 'Unable to complete this action. Please try again.';
}
