import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth, requireEmailVerified } from "../middleware/auth.js";
import { fileUrl, upload } from "../middleware/upload.js";
import {
  createDeliveryAssignmentConversation,
  createProductConversation,
  createStoreConversation,
  createStoreOrderConversation,
  createSupportConversation,
  createUsedListingConversation,
  createUsedOrderConversation,
  getConversationDraftContext,
  getConversation,
  getUnreadMessageCount,
  listConversations,
  listMessages,
  sendMessage,
} from "../services/message.service.js";

export const messageRouter = Router();

const messageSendLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const conversationCreateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

messageRouter.use(requireAuth, requireEmailVerified);

messageRouter.get("/conversations", (req, res) => {
  res.json({ conversations: listConversations(req.auth.user_id) });
});

messageRouter.get("/unread-count", (req, res) => {
  res.json({ unreadCount: getUnreadMessageCount(req.auth.user_id) });
});

messageRouter.post("/conversations", conversationCreateLimiter, (req, res) => {
  const contextType = String(req.body?.contextType || "");
  const contextId = String(req.body?.contextId || "");

  let conversation;
  let draftContext = null;

  if (contextType === "product") {
    const result = createProductConversation(req.auth.user_id, contextId);
    conversation = result.conversation;
    draftContext = result.draftContext;
  } else if (contextType === "used_order") {
    conversation = createUsedOrderConversation(req.auth.user_id, contextId);
  } else if (contextType === "delivery_assignment") {
    conversation = createDeliveryAssignmentConversation(req.auth.user_id, contextId);
  } else if (contextType === "store") {
    conversation = createStoreConversation(req.auth.user_id, contextId);
  } else if (contextType === "order") {
    conversation = createStoreOrderConversation(req.auth.user_id, contextId);
  } else if (contextType === "support") {
    conversation = createSupportConversation(req.auth.user_id);
  } else if (contextType === "used_listing") {
    conversation = createUsedListingConversation(req.auth.user_id, contextId);
    draftContext = getConversationDraftContext(
      req.auth.user_id,
      conversation.id,
      "used_listing",
      contextId,
    );
  } else {
    res.status(422).json({
      error: { message: "Choose a valid conversation type." },
    });
    return;
  }

  res.status(201).json({ conversation, draftContext });
});

messageRouter.get("/conversations/:id", (req, res) => {
  res.json({ conversation: getConversation(req.auth.user_id, req.params.id) });
});

messageRouter.get("/conversations/:id/messages", (req, res) => {
  res.json({ messages: listMessages(req.auth.user_id, req.params.id) });
});

messageRouter.post(
  "/conversations/:id/messages",
  messageSendLimiter,
  upload.single("attachment"),
  (req, res) => {
    res.status(201).json({
      message: sendMessage(req.auth.user_id, req.params.id, {
        ...req.body,
        attachmentUrl: fileUrl(req, req.file),
      }),
    });
  },
);
