export type DemoProduct = {
  id: string;
  name: string;
  description: string;
  category: string;
  priceKobo: number;
  seller: string;
  location: string;
  imageUrl: string;
  likes: number;
};

export const DEMO_CATEGORIES = [
  'All',
  'Fashion',
  'Electronics',
  'Home',
  'Accessories',
] as const;

export const DEMO_PRODUCTS: DemoProduct[] = [
  {
    id: 'demo-1',
    name: 'Everyday canvas sneakers',
    description:
      'An easy finish for your everyday outfit. Lightweight, simple and comfortable.',
    category: 'Fashion',
    priceKobo: 2850000,
    seller: 'Urban Studio',
    location: 'Warri, Delta',
    imageUrl:
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=900&q=80',
    likes: 124,
  },
  {
    id: 'demo-2',
    name: 'Wireless over-ear headphones',
    description:
      'Your playlists, your space. Discover a clean look for work and downtime.',
    category: 'Electronics',
    priceKobo: 4500000,
    seller: 'Sound District',
    location: 'Lagos',
    imageUrl:
      'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=900&q=80',
    likes: 89,
  },
  {
    id: 'demo-3',
    name: 'Minimal everyday watch',
    description:
      'A timeless addition to your collection. A little detail that completes the look.',
    category: 'Accessories',
    priceKobo: 3200000,
    seller: 'The Detail Store',
    location: 'Benin City, Edo',
    imageUrl:
      'https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=900&q=80',
    likes: 208,
  },
  {
    id: 'demo-4',
    name: 'Accent lounge chair',
    description:
      'Give your favourite corner a fresh look with a comfortable statement piece.',
    category: 'Home',
    priceKobo: 9500000,
    seller: 'Living Space',
    location: 'Abuja',
    imageUrl:
      'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=900&q=80',
    likes: 67,
  },
];