import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  clearNotifications,
  getNotificationUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../services/notification.service.js";
import { subscribeNotificationStream } from "../services/realtime.service.js";

export const notificationRouter = Router();

notificationRouter.use(requireAuth);

notificationRouter.get("/", (req, res) => {
  res.json(listNotifications(req.auth.user_id, {
    page: req.query.page,
    limit: req.query.limit,
    filter: req.query.filter,
  }));
});

notificationRouter.get("/unread-count", (req, res) => {
  res.json({ unreadCount: getNotificationUnreadCount(req.auth.user_id) });
});

notificationRouter.get("/stream", (req, res) => {
  subscribeNotificationStream(req.auth.user_id, req, res);
});

notificationRouter.post("/read-all", (req, res) => {
  res.json(markAllNotificationsRead(req.auth.user_id));
});

notificationRouter.patch("/read-all", (req, res) => {
  res.json(markAllNotificationsRead(req.auth.user_id));
});

notificationRouter.post("/:id/read", (req, res) => {
  res.json(markNotificationRead(req.auth.user_id, req.params.id));
});

notificationRouter.patch("/:id/read", (req, res) => {
  res.json(markNotificationRead(req.auth.user_id, req.params.id));
});

notificationRouter.delete("/", (req, res) => {
  res.json(clearNotifications(req.auth.user_id));
});
