export type Product = {
  id: string;
  name: string;
  price: string;
  category: string;
  campus: string;
  sellerName: string;
  sellerUsername: string;
  sellerAvatar: string;
  sellerFollowers: string;
  sellerLikes: string;
  sellerProducts: number;
  sellerResponse: string;
  description: string;
  images: string[];
  stock: number;
  status: "In Stock" | "Low Stock" | "Out of Stock";
  badges: string[];
  deliveryOptions: string[];
  pickupLocation: string;
  deliveryTime: string;
  specs: {
    label: string;
    value: string;
  }[];
  likesCount: string;
  commentsCount: string;
  savesCount: string;
  viewsCount: string;
  commentsPreview: {
    username: string;
    comment: string;
  }[];
};

export const products: Product[] = [
  {
    id: "trendy-sneakers",
    name: "Trendy Sneakers",
    price: "₦25,000",
    category: "Fashion",
    campus: "FUPRE",
    sellerName: "campus-wears",
    sellerUsername: "campus-wears",
    sellerAvatar: "C",
    sellerFollowers: "1.2k",
    sellerLikes: "8.4k",
    sellerProducts: 45,
    sellerResponse: "Usually replies fast",
    description:
      "Clean trendy sneakers available for students around campus. Comfortable, stylish, and suitable for casual wear, class, events, and daily campus movement.",
    images: [
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1608231387042-66d1773070a5?auto=format&fit=crop&w=1200&q=80",
    ],
    stock: 8,
    status: "In Stock",
    badges: ["New Arrival", "Campus Trending", "Delivery Available"],
    deliveryOptions: ["Pickup", "Campus Delivery"],
    pickupLocation: "FUPRE main gate / hostel area",
    deliveryTime: "20 - 45 minutes",
    specs: [
      { label: "Brand", value: "Nike style" },
      { label: "Color", value: "Red / White" },
      { label: "Sizes", value: "40 - 45" },
      { label: "Material", value: "Mesh / Rubber sole" },
      { label: "Gender", value: "Unisex" },
      { label: "Stock", value: "8 available" },
    ],
    likesCount: "1.2k",
    commentsCount: "120",
    savesCount: "430",
    viewsCount: "2.8k",
    commentsPreview: [
      {
        username: "david",
        comment: "Is size 43 available?",
      },
      {
        username: "mira",
        comment: "Can you deliver to hostel?",
      },
    ],
  },
  {
    id: "jollof-rice-combo",
    name: "Jollof Rice Combo",
    price: "₦2,500",
    category: "Food",
    campus: "FUPRE",
    sellerName: "Tasty Bowl",
    sellerUsername: "tasty-bowl",
    sellerAvatar: "T",
    sellerFollowers: "830",
    sellerLikes: "4.9k",
    sellerProducts: 18,
    sellerResponse: "Replies within minutes",
    description:
      "Fresh campus meal combo with jollof rice, protein, and drink options. Available for pickup and fast delivery around campus.",
    images: [
      "https://images.unsplash.com/photo-1604909052743-94e838986d24?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1600891964599-f61ba0e24092?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=1200&q=80",
    ],
    stock: 25,
    status: "In Stock",
    badges: ["Hot Today", "Fast Delivery", "Campus Food"],
    deliveryOptions: ["Pickup", "Campus Delivery"],
    pickupLocation: "FUPRE food area",
    deliveryTime: "15 - 30 minutes",
    specs: [
      { label: "Meal Type", value: "Rice combo" },
      { label: "Protein", value: "Chicken / Beef" },
      { label: "Portion", value: "Standard" },
      { label: "Availability", value: "Daily" },
      { label: "Delivery", value: "Available" },
      { label: "Stock", value: "25 plates" },
    ],
    likesCount: "3.8k",
    commentsCount: "420",
    savesCount: "1.1k",
    viewsCount: "7.4k",
    commentsPreview: [
      {
        username: "josh",
        comment: "Do you deliver to hostel?",
      },
      {
        username: "ella",
        comment: "How much with extra chicken?",
      },
    ],
  },
  {
    id: "engineering-textbook",
    name: "Engineering Textbook",
    price: "₦6,000",
    category: "Academic",
    campus: "FUPRE",
    sellerName: "Book Plug",
    sellerUsername: "bookplug",
    sellerAvatar: "B",
    sellerFollowers: "540",
    sellerLikes: "2.1k",
    sellerProducts: 34,
    sellerResponse: "Replies same day",
    description:
      "Useful engineering textbook for students. Good for assignments, exam preparation, and course reference.",
    images: [
      "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=1200&q=80",
    ],
    stock: 12,
    status: "In Stock",
    badges: ["Academic", "Student Deal"],
    deliveryOptions: ["Pickup"],
    pickupLocation: "Engineering faculty area",
    deliveryTime: "Pickup only",
    specs: [
      { label: "Course", value: "Engineering" },
      { label: "Pages", value: "Complete" },
      { label: "Condition", value: "Good" },
      { label: "Edition", value: "Standard" },
      { label: "Department", value: "Engineering" },
      { label: "Stock", value: "12 copies" },
    ],
    likesCount: "700",
    commentsCount: "58",
    savesCount: "210",
    viewsCount: "1.5k",
    commentsPreview: [
      {
        username: "sam",
        comment: "Is this good for 300 level?",
      },
      {
        username: "tina",
        comment: "Can I pick it tomorrow?",
      },
    ],
  },
  {
    id: "phone-pouch",
    name: "Phone Pouch",
    price: "₦3,000",
    category: "Accessories",
    campus: "FUPRE",
    sellerName: "Gadget Hub",
    sellerUsername: "gadgethub",
    sellerAvatar: "G",
    sellerFollowers: "970",
    sellerLikes: "3.2k",
    sellerProducts: 26,
    sellerResponse: "Replies fast",
    description:
      "Clean phone pouch and accessories available for students around campus.",
    images: [
      "https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1603313011101-320f26a4f6f6?auto=format&fit=crop&w=1200&q=80",
    ],
    stock: 20,
    status: "In Stock",
    badges: ["New", "Accessories", "Campus Deal"],
    deliveryOptions: ["Pickup", "Campus Delivery"],
    pickupLocation: "FUPRE main gate",
    deliveryTime: "20 - 40 minutes",
    specs: [
      { label: "Type", value: "Phone accessory" },
      { label: "Color", value: "Mixed colors" },
      { label: "Material", value: "Leather / Rubber" },
      { label: "Stock", value: "20 available" },
    ],
    likesCount: "850",
    commentsCount: "66",
    savesCount: "190",
    viewsCount: "1.9k",
    commentsPreview: [
      {
        username: "mark",
        comment: "Do you have black color?",
      },
      {
        username: "grace",
        comment: "Can I get two?",
      },
    ],
  },
  {
    id: "logo-design-service",
    name: "Logo Design Service",
    price: "₦10,000",
    category: "Services",
    campus: "FUPRE",
    sellerName: "Design Hub",
    sellerUsername: "designhub",
    sellerAvatar: "D",
    sellerFollowers: "1.5k",
    sellerLikes: "6.7k",
    sellerProducts: 14,
    sellerResponse: "Replies same day",
    description:
      "Professional logo design for student brands, small businesses, vendors, and campus projects.",
    images: [
      "https://images.unsplash.com/photo-1558655146-9f40138edfeb?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1626785774573-4b799315345d?auto=format&fit=crop&w=1200&q=80",
    ],
    stock: 10,
    status: "In Stock",
    badges: ["Service", "Creative", "Popular"],
    deliveryOptions: ["Online Delivery"],
    pickupLocation: "Online service",
    deliveryTime: "24 - 72 hours",
    specs: [
      { label: "Service", value: "Logo design" },
      { label: "Delivery", value: "Digital file" },
      { label: "Revision", value: "2 revisions" },
      { label: "Format", value: "PNG / JPG" },
    ],
    likesCount: "1.6k",
    commentsCount: "140",
    savesCount: "520",
    viewsCount: "3.4k",
    commentsPreview: [
      {
        username: "ben",
        comment: "Can you design for a clothing brand?",
      },
      {
        username: "joy",
        comment: "How long does it take?",
      },
    ],
  },
  {
    id: "campus-shawarma",
    name: "Campus Shawarma",
    price: "₦2,000",
    category: "Food",
    campus: "FUPRE",
    sellerName: "Snack Spot",
    sellerUsername: "snackspot",
    sellerAvatar: "S",
    sellerFollowers: "740",
    sellerLikes: "2.8k",
    sellerProducts: 12,
    sellerResponse: "Replies within minutes",
    description:
      "Fresh shawarma, snacks, and drinks available around campus for pickup and delivery.",
    images: [
      "https://images.unsplash.com/photo-1633321702518-7feccafb94d5?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=1200&q=80",
    ],
    stock: 30,
    status: "In Stock",
    badges: ["Food", "Hot", "Fast Delivery"],
    deliveryOptions: ["Pickup", "Campus Delivery"],
    pickupLocation: "Campus food area",
    deliveryTime: "10 - 25 minutes",
    specs: [
      { label: "Type", value: "Shawarma" },
      { label: "Protein", value: "Chicken / Beef" },
      { label: "Availability", value: "Daily" },
      { label: "Delivery", value: "Available" },
    ],
    likesCount: "2.4k",
    commentsCount: "210",
    savesCount: "780",
    viewsCount: "5.1k",
    commentsPreview: [
      {
        username: "mike",
        comment: "Do you have extra sausage?",
      },
      {
        username: "sarah",
        comment: "Can you deliver now?",
      },
    ],
  },
  {
    id: "wristwatch",
    name: "Classic Wristwatch",
    price: "₦12,000",
    category: "Accessories",
    campus: "FUPRE",
    sellerName: "Time House",
    sellerUsername: "timehouse",
    sellerAvatar: "T",
    sellerFollowers: "620",
    sellerLikes: "1.9k",
    sellerProducts: 22,
    sellerResponse: "Replies fast",
    description:
      "Affordable wristwatches and fashion accessories for students around campus.",
    images: [
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1524805444758-089113d48a6d?auto=format&fit=crop&w=1200&q=80",
    ],
    stock: 15,
    status: "In Stock",
    badges: ["Accessories", "New Arrival"],
    deliveryOptions: ["Pickup", "Campus Delivery"],
    pickupLocation: "FUPRE hostel area",
    deliveryTime: "20 - 45 minutes",
    specs: [
      { label: "Type", value: "Wristwatch" },
      { label: "Gender", value: "Unisex" },
      { label: "Color", value: "Mixed" },
      { label: "Stock", value: "15 available" },
    ],
    likesCount: "920",
    commentsCount: "74",
    savesCount: "280",
    viewsCount: "2.2k",
    commentsPreview: [
      {
        username: "ella",
        comment: "Is silver available?",
      },
      {
        username: "peter",
        comment: "Can I get this today?",
      },
    ],
  },
];

export function getProductById(id: string | undefined) {
  return products.find((product) => product.id === id);
}

export function getRelatedProducts(currentProductId: string | undefined) {
  return products.filter((product) => product.id !== currentProductId);
}