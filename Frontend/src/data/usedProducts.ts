export type UsedProduct = {
  id: string;
  name: string;
  price: string;
  category: string;
  campus: string;
  seller: string;
  sellerUsername: string;
  condition: "Like New" | "Very Good" | "Good" | "Fair" | "Needs Repair";
  status: "Verified Used" | "Under Review" | "Sold";
  postedAt: string;
  image: string;
  images: string[];
  delivery: "Pickup" | "Delivery" | "Pickup & Delivery";
  urgent?: boolean;
  specs: {
    label: string;
    value: string;
  }[];
  verification: {
    sellerVerified: boolean;
    ownershipProof: boolean;
    productReviewed: boolean;
    conditionChecked: boolean;
    gleankApproved: boolean;
  };
  description: string;
};

export const usedProducts: UsedProduct[] = [
  {
    id: "used-hp-laptop",
    name: "Used HP EliteBook Laptop",
    price: "₦180,000",
    category: "Laptops",
    campus: "FUPRE",
    seller: "Campus Deals",
    sellerUsername: "campusdeals",
    condition: "Very Good",
    status: "Verified Used",
    postedAt: "2 days ago",
    delivery: "Pickup & Delivery",
    urgent: true,
    image:
      "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=900&q=80",
    images: [
      "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?auto=format&fit=crop&w=900&q=80",
    ],
    specs: [
      { label: "RAM", value: "8GB" },
      { label: "Storage", value: "256GB SSD" },
      { label: "Processor", value: "Intel Core i5" },
      { label: "Battery", value: "Good" },
      { label: "Charger", value: "Included" },
      { label: "Faults", value: "None reported" },
    ],
    verification: {
      sellerVerified: true,
      ownershipProof: true,
      productReviewed: true,
      conditionChecked: true,
      gleankApproved: true,
    },
    description:
      "Clean HP EliteBook laptop in very good condition. Suitable for school work, coding, design, browsing, and assignments.",
  },
  {
    id: "used-iphone-11",
    name: "iPhone 11",
    price: "₦230,000",
    category: "Phones",
    campus: "FUPRE",
    seller: "Gadget Hub",
    sellerUsername: "gadgethub",
    condition: "Good",
    status: "Verified Used",
    postedAt: "1 day ago",
    delivery: "Pickup",
    image:
      "https://images.unsplash.com/photo-1580910051074-3eb694886505?auto=format&fit=crop&w=900&q=80",
    images: [
      "https://images.unsplash.com/photo-1580910051074-3eb694886505?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1592750475338-74b7b21085ab?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1585060544812-6b45742d762f?auto=format&fit=crop&w=900&q=80",
    ],
    specs: [
      { label: "Storage", value: "64GB" },
      { label: "Battery Health", value: "84%" },
      { label: "Screen", value: "No cracks" },
      { label: "Network", value: "Unlocked" },
      { label: "Accessories", value: "Phone only" },
      { label: "Faults", value: "Minor scratches" },
    ],
    verification: {
      sellerVerified: true,
      ownershipProof: true,
      productReviewed: true,
      conditionChecked: true,
      gleankApproved: true,
    },
    description:
      "Neatly used iPhone 11. Battery still good, screen is clean, and phone works perfectly.",
  },
  {
    id: "engineering-textbooks",
    name: "Engineering Textbooks",
    price: "₦6,000",
    category: "Textbooks",
    campus: "FUPRE",
    seller: "Book Plug",
    sellerUsername: "bookplug",
    condition: "Good",
    status: "Verified Used",
    postedAt: "5 hours ago",
    delivery: "Pickup",
    image:
      "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=900&q=80",
    images: [
      "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=900&q=80",
    ],
    specs: [
      { label: "Course", value: "Engineering" },
      { label: "Pages", value: "Complete" },
      { label: "Edition", value: "Mixed editions" },
      { label: "Condition", value: "Readable" },
      { label: "Missing Pages", value: "No" },
      { label: "Faults", value: "Minor pen marks" },
    ],
    verification: {
      sellerVerified: true,
      ownershipProof: true,
      productReviewed: true,
      conditionChecked: true,
      gleankApproved: true,
    },
    description:
      "Engineering textbooks for students. Pages are complete and suitable for study and exam preparation.",
  },
  {
    id: "hostel-standing-fan",
    name: "Standing Fan",
    price: "₦18,000",
    category: "Hostel Items",
    campus: "FUPRE",
    seller: "Hostel Market",
    sellerUsername: "hostelmarket",
    condition: "Very Good",
    status: "Verified Used",
    postedAt: "3 days ago",
    delivery: "Pickup & Delivery",
    image:
      "https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?auto=format&fit=crop&w=900&q=80",
    images: [
      "https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1585155770447-2f66e2a397b5?auto=format&fit=crop&w=900&q=80",
    ],
    specs: [
      { label: "Type", value: "Standing fan" },
      { label: "Speed", value: "3 speed levels" },
      { label: "Noise", value: "Low" },
      { label: "Faults", value: "None reported" },
    ],
    verification: {
      sellerVerified: true,
      ownershipProof: true,
      productReviewed: true,
      conditionChecked: true,
      gleankApproved: true,
    },
    description:
      "Standing fan for hostel use. Works well and is available for campus pickup or delivery.",
  },
  {
    id: "used-sneakers",
    name: "Nike Sneakers",
    price: "₦22,000",
    category: "Shoes",
    campus: "FUPRE",
    seller: "Campus Wears",
    sellerUsername: "campuswears",
    condition: "Good",
    status: "Verified Used",
    postedAt: "6 hours ago",
    delivery: "Pickup",
    image:
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80",
    images: [
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=900&q=80",
    ],
    specs: [
      { label: "Size", value: "43" },
      { label: "Color", value: "Red/White" },
      { label: "Condition", value: "Good" },
      { label: "Faults", value: "Minor sole marks" },
    ],
    verification: {
      sellerVerified: true,
      ownershipProof: true,
      productReviewed: true,
      conditionChecked: true,
      gleankApproved: true,
    },
    description:
      "Used Nike sneakers in good condition. Clean and suitable for casual campus wear.",
  },
  {
    id: "used-gamepad",
    name: "PS4 Gamepad",
    price: "₦28,000",
    category: "Gaming",
    campus: "FUPRE",
    seller: "Game Zone",
    sellerUsername: "gamezone",
    condition: "Very Good",
    status: "Verified Used",
    postedAt: "4 days ago",
    delivery: "Pickup",
    image:
      "https://images.unsplash.com/photo-1600080972464-8e5f35f63d08?auto=format&fit=crop&w=900&q=80",
    images: [
      "https://images.unsplash.com/photo-1600080972464-8e5f35f63d08?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1612287230202-1ff1d85d1bdf?auto=format&fit=crop&w=900&q=80",
    ],
    specs: [
      { label: "Type", value: "PS4 controller" },
      { label: "Buttons", value: "Working" },
      { label: "Battery", value: "Good" },
      { label: "Faults", value: "None reported" },
    ],
    verification: {
      sellerVerified: true,
      ownershipProof: true,
      productReviewed: true,
      conditionChecked: true,
      gleankApproved: true,
    },
    description:
      "PS4 gamepad in very good condition. All buttons and analog sticks working properly.",
  },
];