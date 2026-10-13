import { FRONTEND_PREVIEW } from '@/config/preview';
import { LiveFeedSheets } from '@/features/live/feed-sheets';
import { LiveProvider } from '@/features/live/state';
import { CommunityProvider } from '@/features/community/community-state';
import { ReviewProvider } from '@/features/reviews/review-state';
import { PaymentProvider } from '@/features/payments/payment-state';
import { ExperienceProvider, OfflineBanner, useExperience } from '@/features/experience/experience';
import { RouteError } from '@/features/experience/recovery';
import { AccountProvider } from '@/features/account/account-state';
import { MarketplaceProvider } from '@/features/marketplace/marketplace-state';
import { MarketplaceSheets } from '@/features/marketplace/marketplace-sheets';
import '../global.css';
import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/context/auth-context';
import { FeedProvider } from '@/features/feed/feed-state';
import { CommerceProvider } from '@/features/commerce/commerce-state';
import { FeedSheets } from '@/features/commerce/feed-sheets';
import { ChatProvider } from '@/features/chat/chat-state';
import { NotificationProvider } from '@/features/notifications/notification-state';
import { DraftProvider } from '@/features/create/draft-store';
import { BrandPreloader } from '@/components/gleenc/preloader';
export default function RootLayout() {
    const [readyFonts, fontError] = useFonts({
        'ReoSans-Light': require('../assets/fonts/ReoSans-Light.otf'),
        'ReoSans-Medium': require('../assets/fonts/ReoSans-Medium.otf'),
        'ReoSans-Bold': require('../assets/fonts/ReoSans-Bold.otf'),
    });
    const [waited, setWaited] = useState(false);
    useEffect(() => {
        const timer = setTimeout(() => setWaited(true), 1000);
        return () => clearTimeout(timer);
    }, []);
    return <SafeAreaProvider><AuthProvider><LiveProvider><AccountProvider><ExperienceProvider><CommunityProvider><DraftProvider><MarketplaceProvider><FeedProvider><CommerceProvider><ReviewProvider><PaymentProvider><ChatProvider><NotificationProvider>
    <AppRoutes ready={waited && Boolean(readyFonts || fontError)}/>{FRONTEND_PREVIEW ? <><FeedSheets/><MarketplaceSheets/></> : <LiveFeedSheets/>}<OfflineBanner />
    </NotificationProvider></ChatProvider></PaymentProvider></ReviewProvider></CommerceProvider></FeedProvider></MarketplaceProvider></DraftProvider></CommunityProvider></ExperienceProvider></AccountProvider></LiveProvider></AuthProvider></SafeAreaProvider>;
}
function AppRoutes({ ready }: {
    ready: boolean;
}) {
    const experience = useExperience();
    return (!ready) ? <BrandPreloader /> : <Stack screenOptions={{ headerShown: false, animation: experience.reducedMotion ? 'none' : 'slide_from_right' }}>
      <Stack.Screen name="index" options={{ animation: experience.reducedMotion ? 'none' : 'fade' }}/>
      <Stack.Screen name="(tabs)" options={{ animation: experience.reducedMotion ? 'none' : 'fade' }}/>
      <Stack.Screen name="(auth)" options={{ animation: experience.reducedMotion ? 'none' : 'slide_from_right' }}/>
      <Stack.Screen name="store"/>
      <Stack.Screen name="product"/>
      <Stack.Screen name="chat"/>
      <Stack.Screen name="explore"/>
      <Stack.Screen name="checkout"/>
      <Stack.Screen name="order-success"/>
      <Stack.Screen name="wallet"/>
      <Stack.Screen name="reviews"/>
      <Stack.Screen name="connections"/>
      <Stack.Screen name="report"/>
      <Stack.Screen name="community-guidelines"/>
      <Stack.Screen name="payment"/>
      <Stack.Screen name="payments"/>
      <Stack.Screen name="receipt"/>
      <Stack.Screen name="reshare-earnings"/>
      <Stack.Screen name="app-status"/>
      <Stack.Screen name="legal"/>

        <Stack.Screen name="edit-profile"/><Stack.Screen name="settings"/><Stack.Screen name="account-deletion"/><Stack.Screen name="addresses"/><Stack.Screen name="bank-accounts"/><Stack.Screen name="withdraw"/><Stack.Screen name="manage-products"/><Stack.Screen name="seller-orders"/><Stack.Screen name="order-details"/><Stack.Screen name="digital-library"/><Stack.Screen name="issue"/>
      <Stack.Screen name="delivery"/><Stack.Screen name="catalogue"/><Stack.Screen name="offer"/><Stack.Screen name="offers"/>
    </Stack>;
}
export function ErrorBoundary({ retry }: {
    error: Error;
    retry: () => Promise<void>;
}) {
    return <SafeAreaProvider><RouteError retry={retry}/></SafeAreaProvider>;
}
