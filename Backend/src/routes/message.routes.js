import { Router } from "express";
import { requireAuth, requireEmailVerified } from "../middleware/auth.js";
import {
  createUsedListingConversation,
  createUsedOrderConversation,
  getConversation,
  listConversations,
  listMessages,
  sendMessage,
} from "../services/message.service.js";

export const messageRouter = Router();

messageRouter.use(requireAuth, requireEmailVerified);

messageRouter.get("/conversations", (req, res) => {
  res.json({ conversations: listConversations(req.auth.user_id) });
});

messageRouter.post("/conversations", (req, res) => {
  const contextType = String(req.body?.contextType || "");
  const contextId = String(req.body?.contextId || "");

  const conversation = contextType === "used_order"
    ? createUsedOrderConversation(req.auth.user_id, contextId)
    : createUsedListingConversation(req.auth.user_id, contextId);

  res.status(201).json({ conversation });
});

messageRouter.get("/conversations/:id", (req, res) => {
  res.json({ conversation: getConversation(req.auth.user_id, req.params.id) });
});

messageRouter.get("/conversations/:id/messages", (req, res) => {
  res.json({ messages: listMessages(req.auth.user_id, req.params.id) });
});

messageRouter.post("/conversations/:id/messages", (req, res) => {
  res.status(201).json({ message: sendMessage(req.auth.user_id, req.params.id, req.body) });
});
