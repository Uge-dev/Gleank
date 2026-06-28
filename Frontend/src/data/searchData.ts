export type SearchProduct = {
  id: string;
  name: string;
  price: string;
  category: string;
  campus: string;
  seller: string;
  sellerId: string;
  image: string;
  tag: string;
  likes: string;
};

export type SearchSeller = {
  id: string;
  storeName: string;
  username: string;
  campus: string;
  category: string;
  followers: string;
  likes: string;
  products: number;
  avatar: string;
  cover: string;
  isNew?: boolean;
};

export type SearchReel = {
  id: string;
  title: string;
  seller: string;
  username: string;
  videoUrl: string;
  thumbnail: string;
  views: string;
  likes: string;
};

export type SearchService = {
  id: string;
  title: string;
  seller: string;
  campus: string;
  price: string;
  category: string;
  image: string;
  rating: string;
};

export const searchProducts: SearchProduct[] = [
  {
    id: "trendy-sneakers",
    name: "Trendy Sneakers",
    price: "₦25,000",
    category: "Fashion",
    campus: "FUPRE",
    seller: "Campus Wears",
    sellerId: "campus-wears",
    image:
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80",
    tag: "Hot Product",
    likes: "1.2k",
  },
  {
    id: "jollof-rice-combo",
    name: "Jollof Rice Combo",
    price: "₦2,500",
    category: "Food",
    campus: "FUPRE",
    seller: "Tasty Bowl",
    sellerId: "tasty-bowl",
    image:
      "https://images.unsplash.com/photo-1604909052743-94e838986d24?auto=format&fit=crop&w=900&q=80",
    tag: "Trending",
    likes: "3.8k",
  },
  {
    id: "phone-pouch",
    name: "Phone Pouch",
    price: "₦3,000",
    category: "Accessories",
    campus: "FUPRE",
    seller: "Gadget Hub",
    sellerId: "gadget-hub",
    image:
      "https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?auto=format&fit=crop&w=900&q=80",
    tag: "New",
    likes: "850",
  },
  {
    id: "engineering-textbook",
    name: "Engineering Textbook",
    price: "₦6,000",
    category: "Academic",
    campus: "FUPRE",
    seller: "Book Plug",
    sellerId: "book-plug",
    image:
      "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=900&q=80",
    tag: "Student Deal",
    likes: "700",
  },
];

export const searchSellers: SearchSeller[] = [
  {
    id: "campus-wears",
    storeName: "Campus Wears",
    username: "campuswears",
    campus: "FUPRE",
    category: "Fashion",
    followers: "1.2k",
    likes: "8.4k",
    products: 45,
    avatar: "C",
    cover:
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "tasty-bowl",
    storeName: "Tasty Bowl",
    username: "tastybowl",
    campus: "FUPRE",
    category: "Food",
    followers: "830",
    likes: "4.9k",
    products: 18,
    avatar: "T",
    cover:
      "https://images.unsplash.com/photo-1604909052743-94e838986d24?auto=format&fit=crop&w=900&q=80",
    isNew: true,
  },
  {
    id: "gadget-hub",
    storeName: "Gadget Hub",
    username: "gadgethub",
    campus: "FUPRE",
    category: "Gadgets",
    followers: "970",
    likes: "3.2k",
    products: 26,
    avatar: "G",
    cover:
      "https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?auto=format&fit=crop&w=900&q=80",
  },
];

export const searchReels: SearchReel[] = [
  {
    id: "jollof-rice-combo",
    title: "Campus food combo available today",
    seller: "Tasty Bowl",
    username: "tastybowl",
    videoUrl:
      "https://videos.pexels.com/video-files/3195944/3195944-uhd_2560_1440_25fps.mp4",
    thumbnail:
      "https://images.unsplash.com/photo-1604909052743-94e838986d24?auto=format&fit=crop&w=900&q=80",
    views: "7.4k",
    likes: "3.8k",
  },
  {
    id: "campus-sneakers",
    title: "New sneakers drop for students",
    seller: "Campus Wears",
    username: "campuswears",
    videoUrl:
      "https://videos.pexels.com/video-files/853919/853919-hd_1920_1080_25fps.mp4",
    thumbnail:
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80",
    views: "5.1k",
    likes: "2.4k",
  },
  {
    id: "hair-styling-service",
    title: "Book campus beauty service",
    seller: "Beauty Corner",
    username: "beautycorner",
    videoUrl:
      "https://videos.pexels.com/video-files/3997798/3997798-uhd_2560_1440_25fps.mp4",
    thumbnail:
      "https://images.unsplash.com/photo-1522337660859-02fbefca4702?auto=format&fit=crop&w=900&q=80",
    views: "3.2k",
    likes: "1.8k",
  },
];

export const searchServices: SearchService[] = [
  {
    id: "logo-design-service",
    title: "Logo Design Service",
    seller: "Design Hub",
    campus: "FUPRE",
    price: "From ₦10,000",
    category: "Branding",
    image:
      "https://images.unsplash.com/photo-1558655146-9f40138edfeb?auto=format&fit=crop&w=900&q=80",
    rating: "4.9",
  },
  {
    id: "laundry-service",
    title: "Laundry & Shoe Cleaning",
    seller: "Clean Plug",
    campus: "FUPRE",
    price: "From ₦1,500",
    category: "Cleaning",
    image:
      "https://images.unsplash.com/photo-1517677208171-0bc6725a3e60?auto=format&fit=crop&w=900&q=80",
    rating: "4.7",
  },
  {
    id: "phone-repair",
    title: "Phone Repair Service",
    seller: "Gadget Fix",
    campus: "FUPRE",
    price: "From ₦3,000",
    category: "Repairs",
    image:
      "https://images.unsplash.com/photo-1597740985671-2a8a3b80502e?auto=format&fit=crop&w=900&q=80",
    rating: "4.8",
  },
];