import type { IconType } from "react-icons";
import {
  FiBell,
  FiMessageCircle,
  FiPackage,
  FiShoppingBag,
  FiStar,
  FiUserPlus,
  FiVideo,
} from "react-icons/fi";

export type NotificationType =
  | "order"
  | "message"
  | "seller"
  | "product"
  | "reel"
  | "system";

export type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  time: string;
  unread: boolean;
  actionLabel: string;
  actionPath: string;
  avatarText?: string;
  image?: string;
};

export const notifications: NotificationItem[] = [
  {
    id: "notif-order-1",
    type: "order",
    title: "Order request confirmed",
    message:
      "Tasty Bowl confirmed your Jollof Rice Combo order. Your order is now being prepared.",
    time: "2 min ago",
    unread: true,
    actionLabel: "Track order",
    actionPath: "/orders/order-001",
    avatarText: "T",
    image:
      "https://images.unsplash.com/photo-1604909052743-94e838986d24?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "notif-message-1",
    type: "message",
    title: "New message from Gadget Fix",
    message:
      "Screen replacement takes about 45 minutes. You can bring the phone anytime today.",
    time: "14 min ago",
    unread: true,
    actionLabel: "Open chat",
    actionPath: "/messages",
    avatarText: "G",
  },
  {
    id: "notif-seller-1",
    type: "seller",
    title: "Campus Wears posted new products",
    message:
      "Campus Wears added new hoodies, joggers, and student fashion items.",
    time: "38 min ago",
    unread: false,
    actionLabel: "View store",
    actionPath: "/stores/campus-wears",
    avatarText: "C",
    image:
      "https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "notif-product-1",
    type: "product",
    title: "Saved product price update",
    message:
      "A product you saved has a new price update. Check it before it sells out.",
    time: "1h ago",
    unread: false,
    actionLabel: "View saved",
    actionPath: "/saved",
    avatarText: "S",
  },
  {
    id: "notif-reel-1",
    type: "reel",
    title: "Your favorite seller posted a reel",
    message:
      "Tasty Bowl posted a new food reel showing today’s lunch package.",
    time: "3h ago",
    unread: true,
    actionLabel: "Watch reel",
    actionPath: "/reels",
    avatarText: "T",
  },
  {
    id: "notif-system-1",
    type: "system",
    title: "Welcome to Gleank",
    message:
      "Complete your profile to get better campus product recommendations.",
    time: "Yesterday",
    unread: false,
    actionLabel: "Open profile",
    actionPath: "/profile",
    avatarText: "G",
  },
];

export function getNotificationIcon(type: NotificationType): IconType {
  if (type === "order") return FiPackage;
  if (type === "message") return FiMessageCircle;
  if (type === "seller") return FiUserPlus;
  if (type === "product") return FiShoppingBag;
  if (type === "reel") return FiVideo;
  if (type === "system") return FiBell;

  return FiStar;
}

export function getNotificationLabel(type: NotificationType) {
  if (type === "order") return "Order";
  if (type === "message") return "Message";
  if (type === "seller") return "Seller";
  if (type === "product") return "Product";
  if (type === "reel") return "Reel";
  if (type === "system") return "System";

  return "Update";
}

export function getNotificationAccent(type: NotificationType) {
  if (type === "order") return "green";
  if (type === "message") return "blue";
  if (type === "seller") return "orange";
  if (type === "product") return "purple";
  if (type === "reel") return "pink";
  if (type === "system") return "dark";

  return "green";
}