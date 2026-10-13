import { requireOptionalNativeModule } from 'expo-modules-core';
import { create } from './vendor/qr-core';
import { originalSeller, type Order } from './settlement';
function escape(value: string) {
    return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
export async function exportOrderLabels(order: Order, actorId: string) {
    const rows = order.items.filter(r => originalSeller(r) === actorId && r.item.productType !== 'digital' && r.tickets.some(t => t.status === 'awaiting'));
    if (!rows.length)
        throw new Error('No awaiting physical delivery labels for this seller.');
    if (!requireOptionalNativeModule('ExpoPrint'))
        throw new Error('Install expo-print and the new development build to export delivery labels.');
    const labels = rows.flatMap(row => row.tickets.filter(t => t.status === 'awaiting').map(ticket => {
        const m = create([{ data: ticket.code, mode: 'alphanumeric' }], { errorCorrectionLevel: 'M' }).modules;
        let cells = '';
        for (let y = 0; y < m.size; y++)
            for (let x = 0; x < m.size; x++)
                if (m.data[y * m.size + x])
                    cells += `<rect x="${x + 4}" y="${y + 4}" width="1" height="1"/>`;
        return `<article><h2>GLEENC · Delivery label</h2><h3>${escape(row.item.name)} · Unit ${ticket.unit}</h3><p>${escape(order.recipient)} · ${escape(order.id)}</p><svg xmlns="http://www.w3.org/2000/svg" width="230" height="230" viewBox="0 0 ${m.size + 8} ${m.size + 8}"><rect width="100%" height="100%" fill="white"/><g fill="black">${cells}</g></svg><p>Only the purchasing buyer can confirm this exact unit.</p><small>${escape(ticket.code)}</small></article>`;
    })).join('');
    const print = require('expo-print') as typeof import('expo-print');
    const result = await print.printToFileAsync({ html: `<!doctype html><html><head><meta charset="utf-8"/><style>body{font-family:Arial;color:#111}article{padding:28px;page-break-after:always;border:1px solid #ddd;text-align:center}small{overflow-wrap:anywhere}article:last-child{page-break-after:auto}</style></head><body>${labels}</body></html>` });
    if (!requireOptionalNativeModule('ExpoSharing'))
        throw new Error('Install the development build containing expo-sharing to export labels.');
    const sharing = require('expo-sharing') as typeof import('expo-sharing');
    if (!await sharing.isAvailableAsync())
        throw new Error('File sharing is unavailable on this device.');
    await sharing.shareAsync(result.uri, { mimeType: 'application/pdf', dialogTitle: 'Gleenc delivery labels' });
}
