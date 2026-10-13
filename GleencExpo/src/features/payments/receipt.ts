import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import type { Order } from '@/features/commerce/commerce-state';
import { formatPrice } from '@/features/feed/data';
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function receiptHtml(order: Order) {
    const e = escapeHtml;
    return '<!doctype html><html><meta charset="utf-8"><body style="font-family:Arial;padding:28px;color:#111"><h1>GLEENC</h1><h2>Test purchase receipt</h2><p>' + e(order.id) + '</p><p>' + e(new Date(order.placedAt).toLocaleString()) + '</p><p>Buyer: ' + e(order.recipient) + '</p><table style="width:100%;border-collapse:collapse">' + order.items.map(row => '<tr><td style="padding:12px;border-bottom:1px solid #ddd">' + e(row.item.name) + '<br><small>Sold by ' + e(row.item.store) + '</small></td><td>' + row.quantity + '</td><td>' + e(formatPrice(row.item.priceKobo * row.quantity)) + '</td></tr>').join('') + '</table><p>Delivery: ' + e(formatPrice(order.deliveryKobo)) + '</p><h2>Total: ' + e(formatPrice(order.totalKobo)) + '</h2><p>Method: ' + e(order.paymentMethod) + '</p><p>No real payment collected. This document is not a bank or tax receipt.</p></body></html>';
}
export async function exportReceipt(order: Order) {
    if (Platform.OS !== 'web' && !requireOptionalNativeModule('ExpoPrint'))
        throw new Error('Install the updated development build containing expo-print.');
    const printed = await (require('expo-print') as typeof import('expo-print')).printToFileAsync({ html: receiptHtml(order) });
    if (!requireOptionalNativeModule('ExpoSharing'))
        throw new Error('Install the updated development build containing expo-sharing.');
    const sharing = require('expo-sharing') as typeof import('expo-sharing');
    if (!await sharing.isAvailableAsync())
        throw new Error('PDF sharing is unavailable on this device.');
    await sharing.shareAsync(printed.uri, { mimeType: 'application/pdf', dialogTitle: 'Gleenc receipt' });
}
