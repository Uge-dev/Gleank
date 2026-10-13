import type { FeedItem } from './data';

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function amount(value: unknown): number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0; }
function mediaUrl(value: unknown): string {
  const source = text(value);
  if (!source) return '';
  try {
    const url = new URL(source);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? source : '';
  } catch { return ''; }
}
/** Keep the post identity separate from the original product and seller identities. */
export function mapRemotePost(value: unknown): FeedItem | null {
  const post = record(value), product = record(post.product), author = record(post.author), owner = record(post.originalOwner), counts = record(post.counts);
  const id = text(post.id), productId = text(product.id), name = text(product.name);
  if (!id || !productId || !name || !text(product.ownerId) || !text(author.id)) return null;
  const media = Array.isArray(product.media) ? product.media.map(record) : [];
  const images = media.filter(m => m.kind === 'image').map(m => mediaUrl(m.url)).filter(Boolean);
  const videoUrl = mediaUrl(media.find(m => m.kind === 'video')?.url);
  const image = mediaUrl(product.posterUrl) || images[0] || '';
  const base = amount(product.priceKobo);
  const bps = Math.min(2000, amount(post.markupBps));
  const commission = Math.floor(base * bps / 10000);
  const price = base + commission;
  if (!Number.isSafeInteger(price)) return null;
  const time = Date.parse(text(post.createdAt));
  const store = text(product.storeName) || text(owner.name) || 'Seller';
  const ordering = record(product.ordering);
  return {
    id, name, kind: product.presentation === 'video' ? 'video' : 'product',
    priceKobo: price, image, images: images.length ? images : image ? [image] : [], videoUrl,
    sellerId: text(product.ownerId), productType: product.kind === 'digital' ? 'digital' : 'physical',
    store, handle: text(author.username) ? '@' + text(author.username).replace(/^@/, '') : text(author.name),
    category: text(product.category), description: text(post.caption) || text(product.description), fullDescription: text(product.description),
    stock: amount(product.stock), createdAt: Number.isFinite(time) ? time : 0,
    likes: amount(counts.likeCount), comments: amount(counts.commentCount), reshares: amount(counts.reshareCount),
    shares: amount(counts.shareCount), views: amount(counts.viewCount), priceVersion: amount(product.version),
    shipping: { pickup: ordering.pickup === true, delivery: ordering.delivery === true, interstate: false,
      pickupArea: '', dispatchArea: '', preparation: typeof ordering.preparationMinutes === 'number' ? `${ordering.preparationMinutes} minutes` : '', handling: '', localFeeKobo: amount(product.deliveryKobo) },
    remote: { productId, postId: id, authorId: text(author.id), ownerId: text(product.ownerId),
      authorName: text(author.name), avatarUrl: mediaUrl(author.avatarUrl), viewerLiked: counts.liked === true, viewerFollowing: author.followed === true,viewerReshared:counts.reshared===true,
      offersEnabled: product.offersEnabled === true, orderingFormat: text(ordering.format), markupBps: bps },
  };
}
export function mapRemotePage(value: unknown): { items: FeedItem[]; nextOffset: number | null } {
  const page = record(value);
  if (!Array.isArray(page.posts) || !(page.nextOffset === null || (typeof page.nextOffset === 'number' && Number.isSafeInteger(page.nextOffset) && page.nextOffset >= 0))) {
    throw new Error('The server returned an invalid feed response.');
  }
  return { items: page.posts.map(mapRemotePost).filter((p): p is FeedItem => p !== null), nextOffset: page.nextOffset as number | null };
}
