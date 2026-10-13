import { useLive } from '@/features/live/state';
import { FRONTEND_PREVIEW } from '@/config/preview';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useNotifications } from '@/features/notifications/notification-state';
import { useChat } from '@/features/chat/chat-state';
import { useAccount } from '@/features/account/account-state';
import { GText } from '@/components/gleenc/text';
export default function TabsLayout() {
    const { colors } = useAppTheme();
    const { unreadCount } = useNotifications();
    const { conversations } = useChat();
    const { preferences } = useAccount();
    const live=useLive();
    const alertCount = !FRONTEND_PREVIEW ? live.counts.notificationCount+live.counts.messageCount : unreadCount + (preferences.messageAlerts ? conversations.filter(c => !c.muted && !c.archived).reduce((total, thread) => total + thread.unread, 0) : 0);
    return <Tabs screenOptions={{
            headerShown: false,
            tabBarHideOnKeyboard: true,
            tabBarActiveTintColor: colors.text,
            tabBarInactiveTintColor: colors.tabIconDefault,
            tabBarStyle: { height: 61, backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1 },
            tabBarLabelStyle: { fontFamily: 'ReoSans-Medium', fontSize: 11, marginBottom: 2 },
            tabBarItemStyle: { paddingTop: 4 },
        }}>
    <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <FontAwesome5 name="home" solid size={size - 2} color={color}/> }}/>
    <Tabs.Screen name="discover" options={{ title: 'Explore', tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'compass' : 'compass-outline'} size={size} color={color}/> }}/>
    <Tabs.Screen name="create" options={{ title: 'Create', tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'add-circle' : 'add-circle-outline'} size={size} color={color}/> }}/>
    <Tabs.Screen name="alerts" options={{ title: 'Alerts', tabBarIcon: ({ color, size, focused }) => <View style={{ width: 32, height: 30, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={focused ? 'notifications' : 'notifications-outline'} size={size} color={color}/>{alertCount > 0 ? <View style={{ position: 'absolute', top: -5, right: -10, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}><GText tone="white" weight="bold" style={{ fontSize: 10 }}>{alertCount > 99 ? '99+' : alertCount}</GText></View> : null}</View> }}/>
    <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'person' : 'person-outline'} size={size} color={color}/> }}/>
    <Tabs.Screen name="market" options={{ href: null }}/>
    <Tabs.Screen name="cart" options={{ href: null }}/>
    <Tabs.Screen name="orders" options={{ href: null }}/>
  </Tabs>;
}
