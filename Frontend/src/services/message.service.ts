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
  contextType: "product" | "used_listing" | "used_order" | "store" | "order" | "support" | "delivery_assignment";
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

    return apiRequest<{ message: GleencMessage }>(
      `/messages/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        method: "POST",
        headers: portalHeaders(portal),
        body: formData,
      },
    );
  }

  return apiRequest<{ message: GleencMessage }>(
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
