import * as Crypto from 'expo-crypto';
import { api } from '@/services/api';
import type { Product, ProductInput, Ordering } from '@/services/gleenc-api';
import { categoryById, CATEGORIES } from '@/features/create/catalog';
import { blankDraft, type ProductDraft } from '@/features/create/model';
import { defaultPlan } from '@/features/marketplace/domain';
import { uploadFile } from './media';
import { naira } from '@/features/marketplace/domain';
const cached = new Map<string, string>();
async function mediaId(owner: string, uri: string, name: string, type: string, kind: string, existing?: string) {
    if (existing?.startsWith('media_'))
        return existing;
    const key = owner + '\0' + kind + '\0' + uri;
    const known = cached.get(key);
    if (known)
        return known;
    const result = await uploadFile(uri, name, type, kind);
    cached.set(key, result.id);
    return result.id;
}
export async function publishDraft(d: ProductDraft, publication: 'draft' | 'publish' | 'schedule') {
    const variantIds=await Promise.all(d.variants.map(async v=>v.serverId||'variant-'+(await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,JSON.stringify(Object.entries(v.labels).sort(([a],[b])=>a.localeCompare(b))))).slice(0,32)));
    const images = [] as string[];
    for (const image of d.images)
        images.push(await mediaId(d.ownerId, image.uri, 'product.jpg', 'image/jpeg', 'image', image.id));
    const video = d.presentation === 'video' && d.videoUri ? await mediaId(d.ownerId, d.videoUri, 'product.mp4', 'video/mp4', 'video', d.videoUri === d.serverVideoUri ? d.serverVideoId : undefined) : null;
    const files = [...(d.serverFileIds || []).filter(id => d.digital?.files.some(file => file.id === id))] as string[];
    for (const file of d.digitalFiles || [])
        files.push(await mediaId(d.ownerId, file.uri, file.name, file.mime, 'digital', file.id));
    const p = d.orderingPlan;
    const ordering: Ordering | undefined = p ? {
        groups: p.groups, format: ({ item: 'single', pack: 'fixed_pack', menu: 'menu', extras: 'pack_extras' } as const)[p.mode], unit: p.unit, components: p.components.filter(c => c.available).map(c => ({ id: c.id, name: c.name, group: c.group, unit: c.unit, unitDescription: c.description, priceKobo: c.priceKobo, stock: c.stock, min: c.min, max: c.max, required: c.min > 0, ...(c.photoId ? { photoId: c.photoId } : {}) })),
        packagingKobo: p.packagingKobo, orderingHours: p.hours, ingredients: p.ingredients, allergens: p.allergens.split(',').map(s => s.trim()).filter(Boolean), pickup: d.pickup, delivery: d.localDelivery || d.interstate,
    } : { format: 'single', unit: 'piece', pickup: d.pickup, delivery: d.localDelivery || d.interstate };
    const body: ProductInput = { name: d.name.trim(), description: d.description.trim(), category: categoryById(d.categoryId)?.name || 'General', priceKobo: p ? p.baseKobo : naira(d.basePrice || '0'), stock: Number(d.baseStock || p?.stock || 0), kind: d.productType || 'physical', presentation: d.presentation, mediaIds: video ? [video] : images, ...(video && images[0] ? { posterId: images[0] } : {}), fileIds: files, licence: d.digital?.licenceText || d.digital?.licence || 'Personal use', attributes: { ...d.attributes, ...(d.sellerSku ? { sellerSku: d.sellerSku } : {}), ...(d.digital ? { digitalLicence: d.digital.licence, digitalVersion: d.digital.version, digitalRequirements: d.digital.requirements } : {}), ...(d.subcategory ? { subcategory: d.subcategory } : {}), ...(d.shortDescription ? { shortDescription: d.shortDescription } : {}), ...(d.pickupArea ? { pickupArea: d.pickupArea } : {}), ...(d.dispatchArea ? { dispatchArea: d.dispatchArea } : {}), ...(d.handling ? { handling: d.handling } : {}), ...(d.deliveryTime ? { preparation: d.deliveryTime } : {}) },
        variants: d.variants.map((v, i) => ({ id: variantIds[i], labels: v.labels, sku: v.sku, size: v.labels.Size || '', color: v.labels.Color || '', ...(d.colorHex[v.labels.Color] ? { colorHex: d.colorHex[v.labels.Color] } : {}), priceKobo: naira(v.price || d.basePrice || '0'), stock: Number(v.stock || d.baseStock || 0), photoIds: d.images.filter(image => image.color === v.labels.Color).map(image => images[d.images.indexOf(image)]).filter(Boolean) })), ordering, offersEnabled: p?.allowOffers ?? true, minimumOfferPercent: p?.minimumPercent ?? 80, reshareEnabled: d.serverReshareEnabled??true, returnDays: d.serverReturnDays??7, ...(d.localDelivery ? { deliveryKobo: naira(d.localFee || '0') } : {}), publication, ...(publication === 'schedule' && d.scheduledAt ? { publishAt: new Date(d.scheduledAt).toISOString() } : {}), ...(d.catalogueId ? { catalogueId: d.catalogueId } : {}) };
    return api.products.save(body, d.publishedId);
}
export function productDraft(product: Product, ownerId: string): ProductDraft {
    const d = blankDraft(ownerId), ordering = product.ordering, category = product.category;
    // The existing editor's category resolver supports the original category IDs.
    const match = CATEGORIES.find(c => c.name === category || c.id === category)?.id;
    const files = (product as any).files || [];
    const allImages:import('@/features/create/model').ProductImage[] = product.media.filter(m => m.kind === 'image').map((m, i) => ({ id: m.id || 'existing-' + i, uri: m.url, color:(product.variants||[]).find(v=>v.photoIds?.includes(m.id||''))?.color||'' })).concat(product.posterUrl && product.posterId ? [{ id: product.posterId, uri: product.posterUrl, color: '' }] : []).concat((product.variants||[]).flatMap(v=>(v.photoUrls||[]).map((uri,index)=>({id:v.photoIds?.[index]||'existing-variant-'+v.id+'-'+index,uri,color:v.color||''}))));
    return { ...d, publishedId: product.id, serverReturnDays:product.returnDays,serverReshareEnabled:product.reshareEnabled,colorHex:Object.fromEntries((product.variants||[]).filter(v=>v.colorHex&&v.color).map(v=>[v.color!,v.colorHex!])),serverFileIds: product.fileIds, serverVideoId: product.media.find(m => m.kind === 'video')?.id, serverVideoUri: product.media.find(m => m.kind === 'video')?.url, serverPosterId: product.posterId, ...(product.kind === 'digital' ? { digital: { files: files.map((f: any) => ({ id: f.id, name: f.name, bytes: f.bytes, mime: f.mimeType })), licence: (product.attributes?.digitalLicence === 'commercial' ? 'commercial' : 'personal') as 'personal' | 'commercial', licenceText: product.licence || '', version: product.attributes?.digitalVersion || '1.0', requirements: product.attributes?.digitalRequirements || '' } } : {}), categoryId: match || category.toLowerCase(), subcategory: product.attributes?.subcategory || 'Other', name: product.name, shortDescription: product.attributes?.shortDescription || product.description.slice(0, 160), description: product.description, presentation: product.presentation || 'image', productType: product.kind || 'physical', basePrice: String(product.priceKobo / 100), baseStock: String(product.stock), pickupArea: product.attributes?.pickupArea || '', dispatchArea: product.attributes?.dispatchArea || '', deliveryTime: product.attributes?.preparation || '', handling: product.attributes?.handling || '', attributes: product.attributes || {}, images: [...new Map(allImages.map(image=>[image.id,image])).values()], videoUri: product.media.find(m => m.kind === 'video')?.url || '', pickup: ordering?.pickup !== false, localDelivery: ordering?.delivery !== false, localFee: String((product.deliveryKobo || 0) / 100), variants: (product.variants || []).map(v => ({ serverId:v.id,key: Object.entries(v.labels||{...(v.size?{Size:v.size}:{}),...(v.color?{Color:v.color}:{})}).map(([name,value])=>name+':'+value).join('|'), labels: (v as any).labels || { ...(v.size ? { Size: v.size } : {}), ...(v.color ? { Color: v.color } : {}) }, price: String((v.priceKobo ?? product.priceKobo) / 100), stock: String(v.stock), sku: (v as any).sku || '' })), options: ([...new Set((product.variants || []).flatMap(v => Object.keys(v.labels || { ...(v.size ? { Size: v.size } : {}), ...(v.color ? { Color: v.color } : {}) })))].map(name => ({ name: name as import('@/features/create/model').OptionName, values: [...new Set((product.variants || []).map(v => (v.labels || { Size: v.size || '', Color: v.color || '' })[name]).filter(Boolean))] }))),
        ...(ordering && product.kind !== 'digital' ? { orderingPlan: { ...defaultPlan(), mode: ({ single: 'item', fixed_pack: 'pack', menu: 'menu', pack_extras: 'extras' } as const)[ordering.format], unit: ordering.unit || 'piece', baseKobo: product.priceKobo, stock: product.stock, packagingKobo: ordering.packagingKobo || 0, groups: ordering.groups || [], components: (ordering.components || []).map(c => ({ ...c, group: c.group || 'Items', description: c.unitDescription || '', available: true, min: c.min || 0, max: c.max || 99 })), hours: ordering.orderingHours || '', ingredients: ordering.ingredients || '', allergens: (ordering.allergens || []).join(', '), minimumPercent: product.minimumOfferPercent ?? 80, allowOffers: product.offersEnabled !== false } } : {}), ...(product.publishAt ? { scheduledAt: Date.parse(product.publishAt) } : {}) };
}
