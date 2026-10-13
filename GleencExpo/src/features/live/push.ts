import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '@/hooks/use-auth';
import { FRONTEND_PREVIEW } from '@/config/preview';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { api } from '@/services/api';
import * as SecureStore from 'expo-secure-store';
const key = 'gleenc.push-device';
export async function enablePush() {
    if (Platform.OS === 'web' || !Device.isDevice)
        throw new Error('Push notifications require a physical iOS or Android device.');
    const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
    if (!projectId)
        throw new Error('Notification registration is temporarily unavailable.');
    if (Platform.OS === 'android')
        await Notifications.setNotificationChannelAsync('activity', { name: 'Gleenc updates', importance: Notifications.AndroidImportance.DEFAULT });
    const initial = await Notifications.getPermissionsAsync(), permission = initial.granted ? initial : await Notifications.requestPermissionsAsync();
    if (!permission.granted)
        throw new Error('Notification permission was not granted. You can enable it in device Settings.');
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await api.account.registerPush({ token, projectId, platform: Platform.OS === 'ios' ? 'ios' : 'android' });
    await SecureStore.setItemAsync(key, token);
    return token;
}
export async function disablePush() { if (Platform.OS === 'web')
    return; const token = await SecureStore.getItemAsync(key); if (!token)
    return; await api.request('/me/push-devices', { method: 'DELETE', body: { token } }); await SecureStore.deleteItemAsync(key); }
/** Notification payloads never supply arbitrary URLs or authorize a purchase. */
export function usePushLifecycle() {
    const { user } = useAuth(), router = useRouter();
    useEffect(() => {
        if (FRONTEND_PREVIEW || Platform.OS === 'web' || !user)
            return;
        let active = true;
        void (async () => { const token = await SecureStore.getItemAsync(key), projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID; if (!active || !token || !projectId)
            return; const permission = await Notifications.getPermissionsAsync(); if (active && permission.granted)
            await api.account.registerPush({ token, projectId, platform: Platform.OS === 'ios' ? 'ios' : 'android' }); })().catch(() => undefined);
        function open() { if (active)
            router.push('/alerts'); }
        const subscription = Notifications.addNotificationResponseReceivedListener(open);
        void Notifications.getLastNotificationResponseAsync().then(response => { if (response && active) {
            open();
            void Notifications.clearLastNotificationResponseAsync();
        } }).catch(() => undefined);
        return () => { active = false; subscription.remove(); };
    }, [user?.id]);
}
