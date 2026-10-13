import type { FeedItem } from '@/features/feed/data';

export function resharePrice(item: FeedItem, salePriceKobo: number) {
  const basePriceKobo = item.offer?.basePriceKobo ?? item.priceKobo;
  if (!Number.isSafeInteger(salePriceKobo) || salePriceKobo < basePriceKobo) throw new Error('Your selling price must be at least the original seller price.');
  if (item.quoteId) throw new Error('A private checkout price cannot be reshared.');
  const eligibleBase = basePriceKobo - (item.config?.packagingKobo ?? item.plan?.packagingKobo ?? 0);
  if (!Number.isSafeInteger(eligibleBase) || eligibleBase < 1) throw new Error('The seller product price is invalid.');
  const commissionKobo = salePriceKobo - basePriceKobo;
  if (commissionKobo > Math.floor(eligibleBase * 0.2)) throw new Error('The maximum reshare increase is 20%.');
  return { basePriceKobo, commissionKobo, markupPercent: basePriceKobo ? commissionKobo / eligibleBase * 100 : 0 };
}
export function makeReshare(item: FeedItem, salePriceKobo: number, promoterId: string, promoterName: string, id: string): FeedItem {
  const pricing = resharePrice(item, salePriceKobo);
  return { ...item, id, priceKobo: salePriceKobo, createdAt: Date.now(), offer: {
    ...pricing, originalProductId: item.offer?.originalProductId ?? item.id, promoterId, promoterName,
  } };
}
