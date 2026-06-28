export type OrderStatus =
  | "request-sent"
  | "confirmed"
  | "preparing"
  | "ready"
  | "completed"
  | "cancelled";

export type OrderItem = {
  id: string;
  name: string;
  price: string;
  quantity: number;
  image: string;
  sellerName: string;
  sellerId: string;
};

export type OrderTimelineStep = {
  id: OrderStatus;
  title: string;
  description: string;
  time: string;
};

export type Order = {
  id: string;
  orderCode: string;
  status: OrderStatus;
  statusLabel: string;
  sellerName: string;
  sellerId: string;
  sellerAvatar: string;
  campus: string;
  deliveryOption: "Pickup" | "Delivery";
  pickupLocation: string;
  total: string;
  date: string;
  items: OrderItem[];
  timeline: OrderTimelineStep[];
};

export const orders: Order[] = [
  {
    id: "order-001",
    orderCode: "GLK-2401",
    status: "preparing",
    statusLabel: "Preparing",
    sellerName: "Tasty Bowl",
    sellerId: "tasty-bowl",
    sellerAvatar: "T",
    campus: "FUPRE",
    deliveryOption: "Delivery",
    pickupLocation: "Hostel Area, FUPRE",
    total: "₦5,000",
    date: "Today, 10:42 AM",
    items: [
      {
        id: "jollof-rice-combo",
        name: "Jollof Rice Combo",
        price: "₦2,500",
        quantity: 2,
        sellerName: "Tasty Bowl",
        sellerId: "tasty-bowl",
        image:
          "https://images.unsplash.com/photo-1604909052743-94e838986d24?auto=format&fit=crop&w=900&q=80",
      },
    ],
    timeline: [
      {
        id: "request-sent",
        title: "Order request sent",
        description: "Your request has been sent to the seller.",
        time: "10:42 AM",
      },
      {
        id: "confirmed",
        title: "Seller confirmed",
        description: "The seller accepted your order request.",
        time: "10:45 AM",
      },
      {
        id: "preparing",
        title: "Preparing order",
        description: "Your item is currently being prepared.",
        time: "10:48 AM",
      },
      {
        id: "ready",
        title: "Ready for delivery",
        description: "The seller will update this when the order is ready.",
        time: "Pending",
      },
      {
        id: "completed",
        title: "Completed",
        description: "Order completed after buyer confirmation.",
        time: "Pending",
      },
    ],
  },
  {
    id: "order-002",
    orderCode: "GLK-2402",
    status: "confirmed",
    statusLabel: "Confirmed",
    sellerName: "Campus Wears",
    sellerId: "campus-wears",
    sellerAvatar: "C",
    campus: "FUPRE",
    deliveryOption: "Pickup",
    pickupLocation: "School Gate",
    total: "₦12,000",
    date: "Yesterday, 4:18 PM",
    items: [
      {
        id: "premium-campus-hoodie",
        name: "Premium Campus Hoodie",
        price: "₦12,000",
        quantity: 1,
        sellerName: "Campus Wears",
        sellerId: "campus-wears",
        image:
          "https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=900&q=80",
      },
    ],
    timeline: [
      {
        id: "request-sent",
        title: "Order request sent",
        description: "Your request has been sent to the seller.",
        time: "4:18 PM",
      },
      {
        id: "confirmed",
        title: "Seller confirmed",
        description: "The seller accepted your order request.",
        time: "4:25 PM",
      },
      {
        id: "preparing",
        title: "Preparing order",
        description: "The seller will update this soon.",
        time: "Pending",
      },
      {
        id: "ready",
        title: "Ready for pickup",
        description: "You will be notified when the order is ready.",
        time: "Pending",
      },
      {
        id: "completed",
        title: "Completed",
        description: "Order completed after buyer confirmation.",
        time: "Pending",
      },
    ],
  },
];

export function getOrderById(id: string | undefined) {
  return orders.find((order) => order.id === id);
}

export function getStatusIndex(status: OrderStatus) {
  const statusOrder: OrderStatus[] = [
    "request-sent",
    "confirmed",
    "preparing",
    "ready",
    "completed",
  ];

  return statusOrder.indexOf(status);
}