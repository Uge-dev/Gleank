import { apiRequest } from "../lib/api";

export type GleencNotificationType =
  | "order"
  | "message"
  | "seller"
  | "product"
  | "like"
  | "admin"
  | "used_market";

export type GleencNotification = {
  id: string;
  type: GleencNotificationType;
  title: string;
  message: string;
  actionLabel: string;
  actionPath: string;
  imageUrl: string | null;
  unread: boolean;
  readAt: string | null;
  createdAt: string;
};

export type NotificationListResponse = {
  notifications: GleencNotification[];
  unreadCount: number;
};

export function getNotifications() {
  return apiRequest<NotificationListResponse>("/notifications");
}

export function getNotificationUnreadCount() {
  return apiRequest<{ unreadCount: number }>("/notifications/unread-count");
}

export function markNotificationRead(id: string) {
  return apiRequest<NotificationListResponse>(
    `/notifications/${encodeURIComponent(id)}/read`,
    { method: "PATCH" },
  );
}

export function markAllNotificationsRead() {
  return apiRequest<NotificationListResponse>("/notifications/read-all", {
    method: "PATCH",
  });
}

export function clearNotifications() {
  return apiRequest<NotificationListResponse>("/notifications", {
    method: "DELETE",
  });
}
