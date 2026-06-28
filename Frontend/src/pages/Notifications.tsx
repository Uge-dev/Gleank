import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  FiBell,
  FiBox,
  FiCheckCircle,
  FiHeart,
  FiMessageCircle,
  FiShoppingBag,
} from "react-icons/fi";

import EmptyState from "../components/EmptyState";

type NotificationType =
  | "order"
  | "message"
  | "seller"
  | "product"
  | "like";

type NotificationFilter = "all" | "unread" | NotificationType;

type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  time: string;
  unread: boolean;
  actionLabel: string;
  actionPath: string;
  image?: string;
};

const initialNotifications: NotificationItem[] = [
  {
    id: "notif-001",
    type: "order",
    title: "New order request",
    message:
      "Mira James placed an order for Jollof Rice Combo. Review and confirm the order.",
    time: "4 min ago",
    unread: true,
    actionLabel: "View order",
    actionPath: "/orders/ORD-1048",
    image:
      "https://images.unsplash.com/photo-1604909052743-94e838986d24?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "notif-002",
    type: "message",
    title: "New buyer message",
    message:
      "Chidera asked if the black campus hoodie is still available in medium size.",
    time: "12 min ago",
    unread: true,
    actionLabel: "Open chat",
    actionPath: "/messages",
  },
  {
    id: "notif-003",
    type: "product",
    title: "Low stock alert",
    message:
      "Campus Hoodie is almost out of stock. Update stock quantity to avoid missed orders.",
    time: "36 min ago",
    unread: true,
    actionLabel: "Manage product",
    actionPath: "/dashboard",
    image:
      "https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "notif-004",
    type: "seller",
    title: "Store profile viewed",
    message:
      "Your store received 240 profile views today from students around campus.",
    time: "1h ago",
    unread: false,
    actionLabel: "View dashboard",
    actionPath: "/dashboard",
  },
  {
    id: "notif-005",
    type: "like",
    title: "Product saved by buyers",
    message:
      "12 students saved Mini Perfume Oil to their saved items in the last 24 hours.",
    time: "Yesterday",
    unread: false,
    actionLabel: "View product",
    actionPath: "/search",
  },
];

const filters: {
  label: string;
  value: NotificationFilter;
}[] = [
  { label: "All", value: "all" },
  { label: "Unread", value: "unread" },
  { label: "Orders", value: "order" },
  { label: "Messages", value: "message" },
  { label: "Sellers", value: "seller" },
  { label: "Products", value: "product" },
  { label: "Activity", value: "like" },
];

function getNotificationIcon(type: NotificationType) {
  if (type === "order") return FiShoppingBag;
  if (type === "message") return FiMessageCircle;
  if (type === "seller") return FiShoppingBag;
  if (type === "product") return FiBox;

  return FiHeart;
}

function getNotificationLabel(type: NotificationType) {
  if (type === "order") return "Order";
  if (type === "message") return "Message";
  if (type === "seller") return "Seller";
  if (type === "product") return "Product";

  return "Activity";
}

function getNotificationAccent(type: NotificationType) {
  if (type === "order") return "green";
  if (type === "message") return "blue";
  if (type === "seller") return "orange";
  if (type === "product") return "purple";

  return "dark";
}

function Notifications() {
  const [notifications, setNotifications] =
    useState<NotificationItem[]>(initialNotifications);

  const [activeFilter, setActiveFilter] = useState<NotificationFilter>("all");

  const unreadCount = useMemo(() => {
    return notifications.filter((notification) => notification.unread).length;
  }, [notifications]);

  const filteredNotifications = useMemo(() => {
    return notifications.filter((notification) => {
      if (activeFilter === "all") return true;
      if (activeFilter === "unread") return notification.unread;

      return notification.type === activeFilter;
    });
  }, [notifications, activeFilter]);

  function markOneAsRead(id: string) {
    setNotifications((currentNotifications) =>
      currentNotifications.map((notification) => {
        if (notification.id !== id) return notification;

        return {
          ...notification,
          unread: false,
        };
      })
    );
  }

  function markAllAsRead() {
    setNotifications((currentNotifications) =>
      currentNotifications.map((notification) => ({
        ...notification,
        unread: false,
      }))
    );
  }

  function clearAllNotifications() {
    setNotifications([]);
    setActiveFilter("all");
  }

  return (
    <section className="notifications-page">
      <div className="notifications-top-fixed">
        <div className="notification-filter-row">
          {filters.map((filter) => {
            const filterCount =
              filter.value === "all"
                ? notifications.length
                : filter.value === "unread"
                  ? unreadCount
                  : notifications.filter(
                      (notification) => notification.type === filter.value
                    ).length;

            return (
              <button
                key={filter.value}
                type="button"
                className={activeFilter === filter.value ? "active" : ""}
                onClick={() => setActiveFilter(filter.value)}
              >
                {filter.label}
                {filterCount > 0 && <small>{filterCount}</small>}
              </button>
            );
          })}
        </div>

        {notifications.length > 0 && (
          <div className="notifications-toolbar">
            <button
              type="button"
              className="notification-mark-btn"
              onClick={markAllAsRead}
              disabled={unreadCount === 0}
            >
              <FiCheckCircle />
              Mark all as read
            </button>

            <button
              type="button"
              className="notification-clear-btn"
              onClick={clearAllNotifications}
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {filteredNotifications.length > 0 ? (
        <div className="notifications-layout">
          <div className="notifications-list">
            {filteredNotifications.map((notification) => {
              const NotificationIcon = getNotificationIcon(notification.type);

              return (
                <article
                  key={notification.id}
                  className={
                    notification.unread
                      ? "notification-card unread"
                      : "notification-card"
                  }
                >
                  <div
                    className={`notification-type-icon ${getNotificationAccent(
                      notification.type
                    )}`}
                  >
                    <NotificationIcon />
                  </div>

                  <div className="notification-card-content">
                    <div className="notification-meta-row">
                      <span>{getNotificationLabel(notification.type)}</span>
                      <time>{notification.time}</time>
                    </div>

                    <h2>{notification.title}</h2>

                    <p>{notification.message}</p>

                    <div className="notification-action-row">
                      <Link
                        to={notification.actionPath}
                        onClick={() => markOneAsRead(notification.id)}
                      >
                        {notification.actionLabel}
                      </Link>

                      {notification.unread && (
                        <button
                          type="button"
                          onClick={() => markOneAsRead(notification.id)}
                        >
                          Mark as read
                        </button>
                      )}
                    </div>
                  </div>

                  {notification.unread && <span className="unread-dot"></span>}
                </article>
              );
            })}
          </div>
        </div>
      ) : (
        <EmptyState
          icon={<FiBell />}
          eyebrow="No notifications"
          title={
            activeFilter === "all"
              ? "You are all caught up"
              : `No ${activeFilter} notifications`
          }
          message="New orders, messages, seller updates, product alerts, and activity will appear here."
          actionLabel={activeFilter === "all" ? "Go to Dashboard" : "Show All"}
          onAction={() => {
            if (activeFilter === "all") {
              window.location.href = "/dashboard";
              return;
            }

            setActiveFilter("all");
          }}
          variant="card"
        />
      )}
    </section>
  );
}

export default Notifications;