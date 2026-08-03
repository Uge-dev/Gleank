import { apiRequest } from "../lib/api";
import type {
  GleencConversation,
  GleencMessage,
  GleencMessageContext,
} from "../types/domain";

export type MessagePortal = "user" | "rider" | "admin";

function portalHeaders(portal: MessagePortal) {
  return { "X-Gleenc-Portal": portal };
}

export function getConversations(portal: MessagePortal = "user") {
  return apiRequest<{ conversations: GleencConversation[] }>(
    "/messages/conversations",
    { headers: portalHeaders(portal) },
  );
}

export function getUnreadMessageCount(portal: MessagePortal = "user") {
  return apiRequest<{ unreadCount: number }>("/messages/unread-count", {
    headers: portalHeaders(portal),
  });
}

export function createConversation(input: {
  contextType: "product" | "used_listing" | "used_order" | "store" | "order" | "support" | "delivery_assignment" | "delivery_offer";
  contextId?: string;
}, portal: MessagePortal = "user") {
  return apiRequest<{
    conversation: GleencConversation;
    draftContext: GleencMessageContext | null;
  }>(
    "/messages/conversations",
    {
      method: "POST",
      headers: portalHeaders(portal),
      body: JSON.stringify(input),
    },
  );
}

export function previewConversation(input: {
  contextType: "product" | "used_listing" | "used_order" | "store" | "order" | "delivery_assignment" | "delivery_offer";
  contextId?: string;
}, portal: MessagePortal = "user") {
  return apiRequest<{
    conversation: GleencConversation;
    draftContext: GleencMessageContext | null;
  }>("/messages/conversation-preview", {
    method: "POST",
    headers: portalHeaders(portal),
    body: JSON.stringify(input),
  });
}

export function getConversation(id: string, portal: MessagePortal = "user") {
  return apiRequest<{ conversation: GleencConversation }>(
    `/messages/conversations/${encodeURIComponent(id)}`,
    { headers: portalHeaders(portal) },
  );
}

export function getConversationMessages(conversationId: string, portal: MessagePortal = "user") {
  return apiRequest<{ messages: GleencMessage[] }>(
    `/messages/conversations/${encodeURIComponent(conversationId)}/messages`,
    { headers: portalHeaders(portal) },
  );
}

export function sendConversationMessage(
  conversationId: string,
  body: string,
  attachment?: File | null,
  context?: GleencMessageContext | null,
  portal: MessagePortal = "user",
) {
  if (attachment) {
    const formData = new FormData();
    formData.append("body", body);
    if (context) {
      formData.append("contextType", context.type);
      formData.append("contextId", context.id);
    }
    formData.append("attachment", attachment);

    return apiRequest<{ message: GleencMessage; conversation?: GleencConversation }>(
      `/messages/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        method: "POST",
        headers: portalHeaders(portal),
        body: formData,
      },
    );
  }

  return apiRequest<{ message: GleencMessage; conversation?: GleencConversation }>(
    `/messages/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: "POST",
      headers: portalHeaders(portal),
      body: JSON.stringify({
        body,
        contextType: context?.type || "",
        contextId: context?.id || "",
      }),
    },
  );
}

export function sendDraftConversationMessage(
  input: {
    contextType: "product" | "used_listing" | "used_order" | "store" | "order" | "delivery_assignment" | "delivery_offer";
    contextId?: string;
    body: string;
    attachment?: File | null;
    messageContext?: GleencMessageContext | null;
  },
  portal: MessagePortal = "user",
) {
  if (input.attachment) {
    const formData = new FormData();
    formData.append("contextType", input.contextType);
    formData.append("contextId", input.contextId || "");
    formData.append("body", input.body);
    if (input.messageContext) {
      formData.append("messageContextType", input.messageContext.type);
      formData.append("messageContextId", input.messageContext.id);
    }
    formData.append("attachment", input.attachment);
    return apiRequest<{ conversation: GleencConversation; message: GleencMessage }>(
      "/messages/drafts/messages",
      { method: "POST", headers: portalHeaders(portal), body: formData },
    );
  }

  return apiRequest<{ conversation: GleencConversation; message: GleencMessage }>(
    "/messages/drafts/messages",
    {
      method: "POST",
      headers: portalHeaders(portal),
      body: JSON.stringify({
        contextType: input.contextType,
        contextId: input.contextId || "",
        body: input.body,
        messageContextType: input.messageContext?.type || "",
        messageContextId: input.messageContext?.id || "",
      }),
    },
  );
}
