import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  FiBell,
  FiBox,
  FiCheckCircle,
  FiHeart,
  FiMessageCircle,
  FiShield,
  FiShoppingBag,
} from "react-icons/fi";

import EmptyState from "../components/EmptyState";
import LoadingState from "../components/LoadingState";
import {
  clearNotifications,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type GleencNotification,
  type GleencNotificationType,
} from "../services/notification.service";

type NotificationFilter = "all" | "unread" | GleencNotificationType;

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
  { label: "Used Market", value: "used_market" },
  { label: "Admin", value: "admin" },
  { label: "Activity", value: "like" },
];

function formatNotificationTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Now";

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMinutes < 1) return "Now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(date);
}

function getNotificationIcon(type: GleencNotificationType) {
  if (type === "order") return FiShoppingBag;
  if (type === "message") return FiMessageCircle;
  if (type === "seller") return FiShoppingBag;
  if (type === "product") return FiBox;
  if (type === "used_market") return FiShield;
  if (type === "admin") return FiBell;

  return FiHeart;
}

function getNotificationLabel(type: GleencNotificationType) {
  if (type === "order") return "Order";
  if (type === "message") return "Message";
  if (type === "seller") return "Seller";
  if (type === "product") return "Product";
  if (type === "used_market") return "Used Market";
  if (type === "admin") return "Admin";

  return "Activity";
}

function getNotificationAccent(type: GleencNotificationType) {
  if (type === "order") return "green";
  if (type === "message") return "blue";
  if (type === "seller") return "orange";
  if (type === "product") return "purple";
  if (type === "used_market") return "pink";
  if (type === "admin") return "dark";

  return "dark";
}

function Notifications() {
  const [notifications, setNotifications] = useState<GleencNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadNotifications = useCallback(async (showSpinner = false) => {
    if (showSpinner) setIsLoading(true);
    setError("");

    try {
      const response = await getNotifications();
      setNotifications(response.notifications);
      setUnreadCount(response.unreadCount);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Notifications could not be loaded.",
      );
    } finally {
      if (showSpinner) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    void loadNotifications(true).finally(() => {
      if (active) setIsLoading(false);
    });

    const timer = window.setInterval(() => {
      void loadNotifications(false);
    }, 5000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [loadNotifications]);

  const filteredNotifications = useMemo(() => {
    return notifications.filter((notification) => {
      if (activeFilter === "all") return true;
      if (activeFilter === "unread") return notification.unread;

      return notification.type === activeFilter;
    });
  }, [notifications, activeFilter]);

  async function markOneAsRead(id: string) {
    try {
      const response = await markNotificationRead(id);
      setNotifications(response.notifications);
      setUnreadCount(response.unreadCount);
    } catch {
      await loadNotifications(false);
    }
  }

  async function markAllAsRead() {
    const response = await markAllNotificationsRead();
    setNotifications(response.notifications);
    setUnreadCount(response.unreadCount);
  }

  async function clearAllNotifications() {
    const response = await clearNotifications();
    setNotifications(response.notifications);
    setUnreadCount(response.unreadCount);
    setActiveFilter("all");
  }

  if (isLoading) {
    return (
      <section className="notifications-page">
        <LoadingState
          title="Loading notifications"
          message="Syncing your latest orders, messages, admin updates and activity."
        />
      </section>
    );
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
                      (notification) => notification.type === filter.value,
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
              onClick={() => void markAllAsRead()}
              disabled={unreadCount === 0}
            >
              <FiCheckCircle />
              Mark all as read
            </button>

            <button
              type="button"
              className="notification-clear-btn"
              onClick={() => void clearAllNotifications()}
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="auth-inline-message error" role="alert">
          {error}
        </div>
      )}

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
                      notification.type,
                    )}`}
                  >
                    <NotificationIcon />
                  </div>

                  <div className="notification-card-content">
                    <div className="notification-meta-row">
                      <span>{getNotificationLabel(notification.type)}</span>
                      <time>{formatNotificationTime(notification.createdAt)}</time>
                    </div>

                    <h2>{notification.title}</h2>

                    <p>{notification.message}</p>

                    <div className="notification-action-row">
                      <Link
                        to={notification.actionPath}
                        onClick={() => void markOneAsRead(notification.id)}
                      >
                        {notification.actionLabel}
                      </Link>

                      {notification.unread && (
                        <button
                          type="button"
                          onClick={() => void markOneAsRead(notification.id)}
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
              : `No ${String(activeFilter).replaceAll("_", " ")} notifications`
          }
          message="New orders, messages, seller updates, admin notices, Used Market actions and activity will appear here."
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
