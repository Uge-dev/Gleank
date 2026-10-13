import { Ionicons } from '@expo/vector-icons';
export type NotificationCategory = 'Orders' | 'Social' | 'Selling' | 'Account';
export type NotificationItem = {
    id: string;
    category: NotificationCategory;
    title: string;
    body: string;
    actor: string;
    icon: keyof typeof Ionicons.glyphMap;
    time: number;
    social?: {
        kind: 'like' | 'comment';
        people: {
            name: string;
            avatar: string;
        }[];
        others: number;
        productName: string;
    };
    destination?: {
        kind: 'product' | 'store' | 'chat' | 'offer' | 'order' | 'issue';
        value: string;
    };
    read: boolean;
};
const now = Date.now();
const ago = (minutes: number) => now - minutes * 60000;
const people = [
    { name: 'Amara', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=140&h=140&fit=crop&crop=faces' },
    { name: 'Tobi', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=140&h=140&fit=crop&crop=faces' },
    { name: 'Zainab', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=140&h=140&fit=crop&crop=faces' },
];
export const DEMO_NOTIFICATIONS: NotificationItem[] = [
    { id: 'n1', category: 'Orders', title: 'Order confirmed', body: 'Your order for Belleful noodles has been placed. The seller is preparing it.', actor: 'Gleenc Orders', icon: 'receipt-outline', time: ago(6), read: false, destination: { kind: 'product', value: 'noodles-prep-video' } },
    { id: 'n2', category: 'Orders', title: 'Payment secured', body: 'Your payment is held safely until the delivery handover is confirmed.', actor: 'Gleenc Pay', icon: 'shield-checkmark-outline', time: ago(24), read: false },
    { id: 'n3', category: 'Selling', title: 'New product inquiry', body: 'Movers asked a question about your listing. Open the chat to respond.', actor: 'Movers', icon: 'chatbubble-ellipses-outline', time: ago(45), read: false, destination: { kind: 'chat', value: 'Movers' } },
    { id: 'n4', category: 'Orders', title: 'Ready for pickup', body: 'Your order is ready. Use the handover code when you receive it.', actor: 'Movers', icon: 'bag-handle-outline', time: ago(105), read: true },
    { id: 'n5', category: 'Social', title: 'New likes', body: 'Your Celebration Cake post is getting love.', actor: 'Your community', icon: 'heart', social: { kind: 'like', people, others: 20, productName: 'Celebration Cake' }, time: ago(188), read: false, destination: { kind: 'product', value: 'cake-decorating-video' } },
    { id: 'n6', category: 'Social', title: 'A new follower', body: 'Campus Wears started following your profile.', actor: 'Campus Wears', icon: 'person-add-outline', time: ago(560), read: true, destination: { kind: 'store', value: 'Campus Wears' } },
    { id: 'n7', category: 'Social', title: 'New comments', body: 'New questions on Trendy Sneakers. Join the conversation.', actor: 'Your community', icon: 'chatbubble', social: { kind: 'comment', people: [people[1], people[2], people[0]], others: 7, productName: 'Trendy Sneakers' }, time: ago(720), read: true, destination: { kind: 'product', value: 'campus-sneakers' } },
    { id: 'n8', category: 'Selling', title: 'Listing approved', body: 'Your product passed review and can be discovered in the feed.', actor: 'Gleenc Studio', icon: 'checkmark-circle-outline', time: ago(1440), read: true },
    { id: 'n9', category: 'Selling', title: 'Your listing needs an update', body: 'Review the product description before submitting it again.', actor: 'Gleenc Studio', icon: 'create-outline', time: ago(1620), read: true },
    { id: 'n10', category: 'Selling', title: 'Reshare earned interest', body: 'A shopper viewed a product from your tracked reshare. Commission details appear after a completed order.', actor: 'Gleenc Earnings', icon: 'repeat-outline', time: ago(1900), read: true },
    { id: 'n15', category: 'Selling', title: 'Low stock', body: 'Only two units remain. Update availability so shoppers see the right stock.', actor: 'Gleenc Studio', icon: 'alert-circle-outline', time: ago(2200), read: true, destination: { kind: 'product', value: 'chicken-pie' } },
    { id: 'n16', category: 'Selling', title: 'Earnings released', body: 'The delivery was confirmed. Your seller earnings are ready in the payout preview.', actor: 'Gleenc Earnings', icon: 'wallet-outline', time: ago(2400), read: true },
    { id: 'n11', category: 'Orders', title: 'Delivery update', body: 'The seller has shared an interstate transport receipt for your order.', actor: 'Gleenc Orders', icon: 'car-outline', time: ago(2900), read: true },
    { id: 'n17', category: 'Orders', title: 'Delivery confirmed', body: 'The handover code was confirmed and your order is complete.', actor: 'Gleenc Orders', icon: 'checkmark-circle-outline', time: ago(3200), read: true },
    { id: 'n12', category: 'Orders', title: 'Refund update', body: 'Your refund request is being reviewed. We will notify you when its status changes.', actor: 'Gleenc Support', icon: 'refresh-circle-outline', time: ago(4000), read: true },
    { id: 'n18', category: 'Social', title: 'A new product from a seller you follow', body: 'Snack Spot just added a fresh product video.', actor: 'Snack Spot', icon: 'play-circle-outline', time: ago(4600), read: true, destination: { kind: 'product', value: 'shawarma-making-video' } },
    { id: 'n13', category: 'Account', title: 'Account security', body: 'A sign-in to your account was detected. If it was not you, review your account security.', actor: 'Gleenc Security', icon: 'lock-closed-outline', time: ago(5580), read: true },
    { id: 'n14', category: 'Account', title: 'Welcome to Gleenc', body: 'Discover products, follow sellers, and build your own storefront.', actor: 'Gleenc', icon: 'sparkles-outline', time: ago(8000), read: true },
];
