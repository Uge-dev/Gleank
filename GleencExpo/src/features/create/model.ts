import { validateDigital, type DigitalDetails, type PrivateFile } from '@/features/digital/files';
import type { FeedItem } from '@/features/feed/data';
import { validatePlan, type Plan } from '@/features/marketplace/domain';
import { categoryById } from './catalog';
export type OptionName = 'Size' | 'Color' | 'Portion' | 'Pack size' | 'Style' | 'Shade' | 'Volume' | 'Capacity' | 'Model' | 'Format' | 'Weight';
export type ProductOption = {
    name: OptionName;
    values: string[];
};
export type ProductImage = {
    id: string;
    uri: string;
    color: string;
};
export type ProductVariant = {
    serverId?: string;
    key: string;
    labels: Record<string, string>;
    price: string;
    stock: string;
    sku: string;
};
export type ProductDraft = {
    serverReturnDays?:number;
    serverReshareEnabled?:boolean;
    serverFileIds?: string[];
    serverVideoId?: string;
    serverVideoUri?: string;
    serverPosterId?: string;
    publishedId?: string;
    productType?: 'physical' | 'digital';
    digital?: DigitalDetails;
    digitalFiles?: PrivateFile[];
    catalogueId?: string;
    orderingPlan?: Plan;
    scheduledAt?: number;
    id: string;
    ownerId: string;
    updatedAt: number;
    state: 'draft' | 'ready';
    presentation: 'image' | 'video';
    categoryId: string;
    subcategory: string;
    name: string;
    shortDescription: string;
    description: string;
    attributes: Record<string, string>;
    options: ProductOption[];
    variants: ProductVariant[];
    colorHex: Record<string, string>;
    images: ProductImage[];
    videoUri: string;
    videoAsset?: FeedItem['videoAsset'];
    basePrice: string;
    baseStock: string;
    sellerSku: string;
    pickup: boolean;
    localDelivery: boolean;
    interstate: boolean;
    pickupArea: string;
    dispatchArea: string;
    localFee: string;
    deliveryTime: string;
    handling: string;
};
export function blankDraft(ownerId: string): ProductDraft {
    return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ownerId, updatedAt: Date.now(), state: 'draft',
        presentation: 'image', categoryId: '', subcategory: '', name: '', shortDescription: '', description: '',
        attributes: {}, options: [], variants: [], colorHex: {}, images: [], videoUri: '', basePrice: '', baseStock: '', sellerSku: '',
        pickup: true, localDelivery: false, interstate: false, pickupArea: '', dispatchArea: '', localFee: '', deliveryTime: '', handling: '' };
}
export function combinations(options: ProductOption[], previous: ProductVariant[]): ProductVariant[] {
    if (!options.length)
        return [];
    const sets = options.filter(option => option.values.length).slice(0, 3);
    if (!sets.length)
        return [];
    let rows: Record<string, string>[] = [{}];
    for (const option of sets)
        rows = rows.flatMap(row => option.values.map(value => ({ ...row, [option.name]: value })));
    return rows.slice(0, 60).map(labels => {
        const key = sets.map(option => `${option.name}:${labels[option.name]}`).join('|');
        return previous.find(row => row.key === key || Object.entries(labels).every(([name,value])=>row.labels[name]===value) && Object.keys(row.labels).length===Object.keys(labels).length) ?? { key, labels, price: '', stock: '', sku: '' };
    });
}
export function draftErrors(draft: ProductDraft): string[] {
    const errors: string[] = [];
    if (draft.orderingPlan) {
        try {
            validatePlan(draft.orderingPlan);
        }
        catch (e) {
            errors.push(e instanceof Error ? e.message : 'Review ordering details.');
        }
    }
    const category = categoryById(draft.categoryId);
    if (!category || !draft.subcategory)
        errors.push('Select a category and subcategory.');
    if (draft.name.trim().length < 2)
        errors.push('Enter a product name.');
    if (draft.shortDescription.trim().length < 8)
        errors.push('Add a short description of at least 8 characters.');
    if (draft.description.trim().length < 15)
        errors.push('Add a fuller product description of at least 15 characters.');
    for (const field of category?.attributes ?? [])
        if (field.required && !draft.attributes[field.key]?.trim() && !(field.key === 'ingredients' && (draft.catalogueId || draft.orderingPlan?.ingredients.trim())))
            errors.push(`Complete ${field.label}.`);
    const price = Number(draft.basePrice);
    if (!draft.catalogueId && !draft.orderingPlan && (!Number.isFinite(price) || price <= 0))
        errors.push('Enter a valid selling price.');
    const stock = Number(draft.baseStock);
    if (!draft.catalogueId && !draft.orderingPlan && !draft.options.length && (!Number.isSafeInteger(stock) || stock < 0))
        errors.push('Enter the available stock.');
    if (!draft.catalogueId && !draft.orderingPlan && draft.options.length && (!draft.variants.length || draft.variants.some(row => !Number.isSafeInteger(Number(row.stock)) || Number(row.stock) < 0 || !row.stock.trim())))
        errors.push('Set stock for every available option.');
    if (!draft.catalogueId && !draft.orderingPlan && draft.variants.some(row => row.price.trim() && !(Number(row.price) > 0)))
        errors.push('Variant price must be greater than zero.');
    if (!draft.images.length)
        errors.push('Add at least one product image or video cover.');
    if (draft.presentation === 'video' && !draft.videoUri)
        errors.push('Select a product video.');
    if (draft.productType !== 'digital' && !(draft.pickup || draft.localDelivery || draft.interstate))
        errors.push('Choose a delivery or pickup method.');
    if (draft.productType !== 'digital' && draft.pickup && !draft.pickupArea.trim())
        errors.push('Enter a pickup area.');
    if (draft.productType !== 'digital' && (draft.localDelivery || draft.interstate) && !draft.dispatchArea.trim())
        errors.push('Enter a dispatch area.');
    if (draft.productType === 'digital') {
        try {
            validateDigital(draft.digital!);
        }
        catch (e) {
            errors.push(e instanceof Error ? e.message : 'Attach your digital files.');
        }
        if (draft.options.length || draft.catalogueId || draft.orderingPlan)
            errors.push('Digital products use a single licence price; remove physical variants and menus.');
    }
    return errors;
}
