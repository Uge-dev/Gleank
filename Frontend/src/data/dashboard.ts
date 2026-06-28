export type DashboardStat = {
  label: string;
  value: string;
  change: string;
  tone: "green" | "orange" | "blue" | "dark";
};

export type DashboardProduct = {
  id: string;
  name: string;
  category: string;
  price: string;
  stock: number;
  status: "Active" | "Low Stock" | "Draft";
  image: string;
};

export type DashboardOrder = {
  id: string;
  buyer: string;
  item: string;
  amount: string;
  status: "Pending" | "Confirmed" | "Preparing" | "Completed";
  time: string;
};

export type DashboardMessage = {
  id: string;
  buyer: string;
  message: string;
  time: string;
  unread: boolean;
};

export type DashboardService = {
  id: string;
  name: string;
  price: string;
  bookings: number;
  image: string;
};

export type StorePerformanceItem = {
  label: string;
  value: number;
};

export const dashboardStats: DashboardStat[] = [
  {
    label: "Total Revenue",
    value: "₦428,500",
    change: "+18.4% this week",
    tone: "green",
  },
  {
    label: "Orders",
    value: "126",
    change: "24 pending",
    tone: "orange",
  },
  {
    label: "Store Views",
    value: "12.8k",
    change: "+2.1k today",
    tone: "blue",
  },
  {
    label: "Followers",
    value: "4,820",
    change: "+340 this month",
    tone: "dark",
  },
];

export const dashboardProducts: DashboardProduct[] = [
  {
    id: "jollof-rice-combo",
    name: "Jollof Rice Combo",
    category: "Food",
    price: "₦2,500",
    stock: 38,
    status: "Active",
    image:
      "https://images.unsplash.com/photo-1604909052743-94e838986d24?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "campus-hoodie",
    name: "Campus Hoodie",
    category: "Fashion",
    price: "₦12,000",
    stock: 7,
    status: "Low Stock",
    image:
      "https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "phone-pouch",
    name: "Phone Pouch",
    category: "Accessories",
    price: "₦3,000",
    stock: 15,
    status: "Active",
    image:
      "https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?auto=format&fit=crop&w=900&q=80",
  },
];

export const dashboardOrders: DashboardOrder[] = [
  {
    id: "ORD-1048",
    buyer: "Mira James",
    item: "Jollof Rice Combo",
    amount: "₦2,500",
    status: "Pending",
    time: "4 min ago",
  },
  {
    id: "ORD-1047",
    buyer: "Daniel K.",
    item: "Campus Hoodie",
    amount: "₦12,000",
    status: "Confirmed",
    time: "18 min ago",
  },
  {
    id: "ORD-1046",
    buyer: "Precious A.",
    item: "Phone Pouch",
    amount: "₦3,000",
    status: "Preparing",
    time: "42 min ago",
  },
  {
    id: "ORD-1045",
    buyer: "Samuel O.",
    item: "Food Delivery",
    amount: "₦4,000",
    status: "Completed",
    time: "1h ago",
  },
];

export const dashboardMessages: DashboardMessage[] = [
  {
    id: "msg-001",
    buyer: "Chidera",
    message: "Is the hoodie still available in black?",
    time: "2 min ago",
    unread: true,
  },
  {
    id: "msg-002",
    buyer: "Kelvin",
    message: "Can you deliver to hostel B today?",
    time: "15 min ago",
    unread: true,
  },
  {
    id: "msg-003",
    buyer: "Amaka",
    message: "Thank you, I have received my order.",
    time: "1h ago",
    unread: false,
  },
];

export const dashboardServices: DashboardService[] = [
  {
    id: "service-001",
    name: "Phone Repair",
    price: "From ₦10,000",
    bookings: 18,
    image:
      "https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "service-002",
    name: "Food Delivery",
    price: "From ₦1,000",
    bookings: 42,
    image:
      "https://images.unsplash.com/photo-1526367790999-0150786686a2?auto=format&fit=crop&w=900&q=80",
  },
];

export const storePerformance: StorePerformanceItem[] = [
  {
    label: "Mon",
    value: 42,
  },
  {
    label: "Tue",
    value: 64,
  },
  {
    label: "Wed",
    value: 48,
  },
  {
    label: "Thu",
    value: 78,
  },
  {
    label: "Fri",
    value: 92,
  },
  {
    label: "Sat",
    value: 70,
  },
  {
    label: "Sun",
    value: 88,
  },
];