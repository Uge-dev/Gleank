export type Attribute = {
    key: string;
    label: string;
    hint: string;
    required?: boolean;
};
export type Category = {
    id: string;
    name: string;
    icon: string;
    subcategories: string[];
    attributes: Attribute[];
    options: string[];
};
export const CATEGORIES: Category[] = [
    { id: 'digital', name: 'Digital Downloads', icon: 'document-outline', subcategories: ['PDFs & Ebooks', 'Templates', 'Design resources', 'Office files', 'Other downloads'], options: [], attributes: [{ key: 'format', label: 'File format', hint: 'PDF, ZIP, DOCX…' }] },
    { id: 'food', name: 'Food & Drinks', icon: 'restaurant-outline', subcategories: ['Prepared meals', 'Snacks', 'Baked goods', 'Beverages', 'Groceries'], options: ['Portion', 'Pack size'], attributes: [
            { key: 'ingredients', label: 'Ingredients', hint: 'What goes into it?', required: true },
            { key: 'allergens', label: 'Allergen information', hint: 'E.g. nuts, milk, wheat; say none if applicable' },
            { key: 'preparation', label: 'Preparation time', hint: 'E.g. 25 minutes' },
            { key: 'storage', label: 'Storage or expiry', hint: 'For packaged or perishable items' },
        ] },
    { id: 'fashion', name: 'Clothing & Footwear', icon: 'shirt-outline', subcategories: ['Clothing', 'Footwear', 'Uniforms'], options: ['Size', 'Color'], attributes: [
            { key: 'sizeSystem', label: 'Size system', hint: 'UK, EU, US or custom', required: true },
            { key: 'material', label: 'Material', hint: 'E.g. cotton and polyester' },
            { key: 'fit', label: 'Fit', hint: 'E.g. relaxed, slim, regular' },
        ] },
    { id: 'accessories', name: 'Bags & Accessories', icon: 'bag-handle-outline', subcategories: ['Bags', 'Watches', 'Jewelry', 'Eyewear', 'Other accessories'], options: ['Color', 'Size', 'Style'], attributes: [
            { key: 'material', label: 'Material or finish', hint: 'E.g. leather, stainless steel' },
            { key: 'dimensions', label: 'Dimensions or strap size', hint: 'Use cm where applicable' },
            { key: 'capacity', label: 'Capacity', hint: 'For bags and similar items' },
        ] },
    { id: 'beauty', name: 'Beauty & Personal Care', icon: 'sparkles-outline', subcategories: ['Skincare', 'Cosmetics', 'Hair products', 'Fragrances'], options: ['Shade', 'Volume'], attributes: [
            { key: 'ingredients', label: 'Ingredients', hint: 'List the key ingredients', required: true },
            { key: 'suitability', label: 'Skin or hair suitability', hint: 'If applicable' },
            { key: 'expiry', label: 'Expiry date', hint: 'For products with an expiry date' },
        ] },
    { id: 'electronics', name: 'Phones & Electronics', icon: 'phone-portrait-outline', subcategories: ['Phones', 'Computers', 'Audio', 'Accessories', 'Appliances'], options: ['Color', 'Capacity', 'Model'], attributes: [
            { key: 'brand', label: 'Brand', hint: 'Brand name', required: true },
            { key: 'model', label: 'Model', hint: 'Model number/name', required: true },
            { key: 'compatibility', label: 'Compatibility', hint: 'Devices it works with' },
            { key: 'warranty', label: 'Warranty offered', hint: 'Only if the seller offers one' },
            { key: 'included', label: 'What is included', hint: 'E.g. charger, cable' },
        ] },
    { id: 'home', name: 'Home & Kitchen', icon: 'home-outline', subcategories: ['Cookware', 'Furnishings', 'Decor', 'Kitchen appliances'], options: ['Color', 'Size', 'Capacity'], attributes: [
            { key: 'dimensions', label: 'Dimensions', hint: 'Length × width × height in cm' },
            { key: 'material', label: 'Material', hint: 'E.g. ceramic, wood, steel' },
            { key: 'handling', label: 'Assembly or handling', hint: 'Fragile, assembly needed, etc.' },
        ] },
    { id: 'books', name: 'Books & Learning', icon: 'book-outline', subcategories: ['Textbooks', 'Stationery', 'Learning materials'], options: ['Format', 'Pack size'], attributes: [
            { key: 'author', label: 'Author', hint: 'For books' },
            { key: 'edition', label: 'Edition', hint: 'E.g. 4th edition' },
            { key: 'isbn', label: 'ISBN', hint: 'If one is printed on the book' },
            { key: 'subject', label: 'Subject', hint: 'E.g. electrical engineering' },
        ] },
    { id: 'sports', name: 'Sports & Lifestyle', icon: 'fitness-outline', subcategories: ['Equipment', 'Fitness accessories', 'Outdoor items'], options: ['Size', 'Color', 'Weight'], attributes: [
            { key: 'material', label: 'Material', hint: 'What is it made from?' },
            { key: 'dimensions', label: 'Size or weight', hint: 'Use units' },
            { key: 'usage', label: 'Intended use', hint: 'What is it suitable for?' },
        ] },
    { id: 'other', name: 'Other physical goods', icon: 'cube-outline', subcategories: ['Other'], options: ['Color', 'Size', 'Style'], attributes: [
            { key: 'specifications', label: 'Key specifications', hint: 'Include measurements or model details where relevant' },
        ] },
];
export const categoryById = (id: string) => CATEGORIES.find(category => category.id === id);
