export type StoreProduct = {
  id: string;
  name: string;
  price: string;
  category: string;
  image: string;
  badge?: string;
  isFavorite?: boolean;
};

export type StoreService = {
  id: string;
  title: string;
  price: string;
  image: string;
  duration: string;
  category: string;
  isFavorite?: boolean;
};

export type StoreHighlight = {
  id: string;
  title: string;
  image: string;
  category: string;
};

export type SellerStore = {
  id: string;
  storeName: string;
  username: string;
  campus: string;
  category: string;
  avatar: string;
  profileImage?: string;
  coverImage: string;
  bio: string;
  following: string;
  followers: string;
  likes: string;
  productsCount: number;
  responseRate: string;
  joined: string;
  highlights: StoreHighlight[];
  products: StoreProduct[];
  services: StoreService[];
};

export const sellerStores: SellerStore[] = [
  {
    id: "tasty-bowl",
    storeName: "Tasty Bowl",
    username: "tastybowl",
    campus: "FUPRE",
    category: "Food Vendor",
    avatar: "TB",
    profileImage:
      "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=500&q=80",
    coverImage:
      "https://images.unsplash.com/photo-1604909052743-94e838986d24?auto=format&fit=crop&w=1600&q=80",
    bio: "Fresh campus meals, rice combos, snacks, and drinks delivered around campus. DM for delivery, pickup, and bulk food orders.",
    following: "24",
    followers: "830",
    likes: "4.9k",
    productsCount: 18,
    responseRate: "Replies within minutes",
    joined: "Joined 2026",
    highlights: [
      {
        id: "jollof",
        title: "Jollof & Chicken",
        category: "Jollof",
        image:
          "https://images.unsplash.com/photo-1604909052743-94e838986d24?auto=format&fit=crop&w=500&q=80",
      },
      {
        id: "stew",
        title: "Tomatoes Stew",
        category: "Stew",
        image:
          "https://images.unsplash.com/photo-1600891964599-f61ba0e24092?auto=format&fit=crop&w=500&q=80",
      },
      {
        id: "rice",
        title: "Rice Bowls",
        category: "Rice",
        image:
          "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=500&q=80",
      },
      {
        id: "fried-rice",
        title: "Fried Rice",
        category: "Fried Rice",
        image:
          "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=500&q=80",
      },
      {
        id: "snacks",
        title: "Snacks",
        category: "Snacks",
        image:
          "https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=500&q=80",
      },
      {
        id: "favorites",
        title: "Favorites",
        category: "Favorites",
        image:
          "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=500&q=80",
      },
    ],
    products: [
      {
        id: "jollof-rice-combo",
        name: "Jollof Rice Combo",
        price: "₦2,500",
        category: "Jollof",
        badge: "Hot",
        isFavorite: true,
        image:
          "https://images.unsplash.com/photo-1604909052743-94e838986d24?auto=format&fit=crop&w=800&q=80",
      },
      {
        id: "fried-rice-pack",
        name: "Fried Rice Pack",
        price: "₦3,000",
        category: "Fried Rice",
        badge: "New",
        image:
          "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=800&q=80",
      },
      {
        id: "tomato-stew-pack",
        name: "Tomato Stew Pack",
        price: "₦2,000",
        category: "Stew",
        isFavorite: true,
        image:
          "https://images.unsplash.com/photo-1600891964599-f61ba0e24092?auto=format&fit=crop&w=800&q=80",
      },
      {
        id: "campus-shawarma",
        name: "Campus Shawarma",
        price: "₦2,000",
        category: "Snacks",
        badge: "Fast",
        image:
          "https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=800&q=80",
      },
      {
        id: "beef-rice",
        name: "Beef Rice Bowl",
        price: "₦3,500",
        category: "Rice",
        image:
          "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80",
      },
      {
        id: "chicken-rice",
        name: "Chicken Rice Plate",
        price: "₦3,800",
        category: "Rice",
        badge: "Best Seller",
        isFavorite: true,
        image:
          "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=800&q=80",
      },
      {
        id: "peppered-chicken",
        name: "Peppered Chicken",
        price: "₦2,800",
        category: "Jollof",
        badge: "Favorite",
        isFavorite: true,
        image:
          "https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?auto=format&fit=crop&w=800&q=80",
      },
      {
        id: "student-rice-bowl",
        name: "Student Rice Bowl",
        price: "₦2,200",
        category: "Rice",
        image:
          "https://images.unsplash.com/photo-1594007654729-407eedc4be65?auto=format&fit=crop&w=800&q=80",
      },
    ],
    services: [
      {
        id: "food-delivery",
        title: "Campus Food Delivery",
        price: "From ₦500",
        duration: "15 - 30 mins",
        category: "Delivery",
        isFavorite: true,
        image:
          "https://images.unsplash.com/photo-1526367790999-0150786686a2?auto=format&fit=crop&w=800&q=80",
      },
      {
        id: "bulk-food-order",
        title: "Bulk Food Order",
        price: "From ₦15,000",
        duration: "Same day booking",
        category: "Bulk Orders",
        image:
          "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=800&q=80",
      },
    ],
  },
  {
    id: "campus-wears",
    storeName: "Campus Wears",
    username: "campuswears",
    campus: "FUPRE",
    category: "Fashion Store",
    avatar: "CW",
    profileImage:
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=500&q=80",
    coverImage:
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1600&q=80",
    bio: "Sneakers, jerseys, streetwear, and student fashion products available around campus.",
    following: "18",
    followers: "1.2k",
    likes: "8.4k",
    productsCount: 45,
    responseRate: "Usually replies fast",
    joined: "Joined 2026",
    highlights: [
      {
        id: "sneakers",
        title: "Sneakers",
        category: "Sneakers",
        image:
          "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=500&q=80",
      },
      {
        id: "shirts",
        title: "Shirts",
        category: "Shirts",
        image:
          "https://images.unsplash.com/photo-1523381294911-8d3cead13475?auto=format&fit=crop&w=500&q=80",
      },
      {
        id: "jerseys",
        title: "Jerseys",
        category: "Jerseys",
        image:
          "https://images.unsplash.com/photo-1577223625816-7546f13df25d?auto=format&fit=crop&w=500&q=80",
      },
      {
        id: "favorites",
        title: "Favorites",
        category: "Favorites",
        image:
          "https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=500&q=80",
      },
    ],
    products: [
      {
        id: "trendy-sneakers",
        name: "Trendy Sneakers",
        price: "₦25,000",
        category: "Sneakers",
        badge: "New Arrival",
        isFavorite: true,
        image:
          "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80",
      },
      {
        id: "football-jersey",
        name: "Football Jersey",
        price: "₦8,500",
        category: "Jerseys",
        image:
          "https://images.unsplash.com/photo-1577223625816-7546f13df25d?auto=format&fit=crop&w=800&q=80",
      },
      {
        id: "campus-shirt",
        name: "Campus Shirt",
        price: "₦6,000",
        category: "Shirts",
        image:
          "https://images.unsplash.com/photo-1523381294911-8d3cead13475?auto=format&fit=crop&w=800&q=80",
      },
      {
        id: "white-sneakers",
        name: "White Sneakers",
        price: "₦22,000",
        category: "Sneakers",
        isFavorite: true,
        image:
          "https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=800&q=80",
      },
    ],
    services: [],
  },
];

export function getSellerStoreById(slug: string | undefined) {
  if (!slug) return undefined;

  const cleanedSlug = slug
    .toLowerCase()
    .trim()
    .replaceAll("@", "")
    .replaceAll(" ", "-");

  return sellerStores.find((store) => {
    const storeId = store.id.toLowerCase().trim();
    const storeUsername = store.username.toLowerCase().trim();
    const storeNameSlug = store.storeName
      .toLowerCase()
      .trim()
      .replaceAll(" ", "-");

    return (
      storeId === cleanedSlug ||
      storeUsername === cleanedSlug ||
      storeNameSlug === cleanedSlug
    );
  });
}