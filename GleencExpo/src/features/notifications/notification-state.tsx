import { useAccount } from '@/features/account/account-state';
import { useCommerce } from '@/features/commerce/commerce-state';
import { useMarketplace } from '@/features/marketplace/marketplace-state';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { FRONTEND_PREVIEW } from '@/config/preview';
import { DEMO_NOTIFICATIONS, type NotificationItem } from './demo-notifications';
type NotificationState = {
    notifications: NotificationItem[];
    unreadCount: number;
    markRead: (id: string) => void;
    markAllRead: () => void;
    toggleRead: (id: string) => void;
    remove: (id: string) => void;
};
const Context = createContext<NotificationState | null>(null);
export function NotificationProvider({ children }: {
    children: ReactNode;
}) {
    const { quotes, buyerId } = useMarketplace();
    const commerce = useCommerce();
    const account = useAccount();
    const [hidden, setHidden] = useState<string[]>([]);
    useEffect(() => {
        setSeen([]);
        setHidden([]);
    }, [buyerId]);
    const [clock, setClock] = useState(Date.now());
    useEffect(() => {
        const timer = setInterval(() => setClock(Date.now()), 30000);
        return () => clearInterval(timer);
    }, []);
    const [seen, setSeen] = useState<string[]>([]);
    const [notifications, setNotifications] = useState<NotificationItem[]>(FRONTEND_PREVIEW ? DEMO_NOTIFICATIONS : []);
    const markRead = (id: string) => {
        setSeen(v => [...v, id]);
        setNotifications(previous => previous.map(item => item.id === id ? { ...item, read: true } : item));
    };
    const markAllRead = () => setNotifications(previous => previous.map(item => ({ ...item, read: true })));
    const toggleRead = (id: string) => {
        setSeen(v => v.includes(id) ? v.filter(x => x !== id) : [...v, id]);
        setNotifications(previous => previous.map(item => item.id === id ? { ...item, read: !item.read } : item));
    };
    const remove = (id: string) => {
        setHidden(v => [...v, id]);
        setNotifications(previous => previous.filter(item => item.id !== id));
    };
    const events: NotificationItem[] = quotes.filter(q => q.buyerId === buyerId || q.sellerId === buyerId).map(q => ({ id: 'offer-event:' + q.id + ':' + q.updatedAt + (q.expiresAt <= clock && !['purchased', 'declined', 'cancelled'].includes(q.state) ? ':expired' : ''), category: q.state === 'pending' ? 'Selling' : 'Orders', title: q.expiresAt <= clock && !['purchased', 'declined', 'cancelled'].includes(q.state) ? 'Price offer expired' : q.state === 'pending' ? (q.sellerId === buyerId ? 'New price offer' : 'Your offer was sent') : q.state === 'accepted' ? 'Your offer was accepted' : q.state === 'counter' ? 'Seller sent a counteroffer' : 'Offer ' + q.state, body: q.quantity + ' × ' + q.item.name + ' · Open the offer to review its terms.', actor: q.item.store, icon: 'pricetag-outline', time: q.updatedAt, read: seen.includes('offer-event:' + q.id + ':' + q.updatedAt + (q.expiresAt <= clock && !['purchased', 'declined', 'cancelled'].includes(q.state) ? ':expired' : '')), destination: { kind: 'offer', value: q.id } }));
    const orderEvents: NotificationItem[] = commerce.orders.filter(o => o.buyerId === buyerId).flatMap(o => o.items.map(row => ({ id: 'order:' + row.lineId + ':' + (row.events?.length ?? 0), category: 'Orders' as const, title: row.item.productType === 'digital' ? 'Digital purchase ready' : row.phase ?? 'Order placed', body: row.item.name, actor: row.item.store, icon: 'receipt-outline' as const, time: row.events?.[row.events.length - 1]?.at ?? o.placedAt, read: seen.includes('order:' + row.lineId + ':' + (row.events?.length ?? 0)), destination: { kind: 'order' as const, value: o.id } })));
    const issueEvents: NotificationItem[] = commerce.issues.map(i => ({ id: 'issue:' + i.id + ':' + i.updatedAt, category: 'Orders', title: i.kind + ' · ' + i.status, body: i.response || i.reason, actor: 'Order support', icon: 'help-circle-outline', time: i.updatedAt, read: seen.includes('issue:' + i.id + ':' + i.updatedAt), destination: { kind: 'issue', value: i.id } }));
    const all = [...orderEvents, ...issueEvents, ...events, ...notifications].filter(e => !hidden.includes(e.id) && (e.category === 'Social' ? account.preferences.socialAlerts : e.category === 'Orders' || e.category === 'Selling' ? account.preferences.orderAlerts : true));
    const markEvery = () => {
        setSeen(all.map(e => e.id));
        markAllRead();
    };
    return <Context.Provider value={{ notifications: all, unreadCount: all.filter(item => !item.read).length, markRead, markAllRead: markEvery, toggleRead, remove }}>{children}</Context.Provider>;
}
export function useNotifications() {
    const state = useContext(Context);
    if (!state)
        throw new Error('NotificationProvider is missing');
    return state;
}
