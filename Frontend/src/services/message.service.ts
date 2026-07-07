import { apiRequest } from "../lib/api";
import type { GleencConversation, GleencMessage } from "../types/domain";

export function getConversations() {
  return apiRequest<{ conversations: GleencConversation[] }>(
    "/messages/conversations",
  );
}

export function getUnreadMessageCount() {
  return apiRequest<{ unreadCount: number }>("/messages/unread-count");
}

export function createConversation(input: {
  contextType: "used_listing" | "used_order" | "store" | "order" | "support";
  contextId?: string;
}) {
  return apiRequest<{ conversation: GleencConversation }>(
    "/messages/conversations",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function getConversation(id: string) {
  return apiRequest<{ conversation: GleencConversation }>(
    `/messages/conversations/${encodeURIComponent(id)}`,
  );
}

export function getConversationMessages(conversationId: string) {
  return apiRequest<{ messages: GleencMessage[] }>(
    `/messages/conversations/${encodeURIComponent(conversationId)}/messages`,
  );
}

export function sendConversationMessage(
  conversationId: string,
  body: string,
  attachment?: File | null,
) {
  if (attachment) {
    const formData = new FormData();
    formData.append("body", body);
    formData.append("attachment", attachment);

    return apiRequest<{ message: GleencMessage }>(
      `/messages/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        method: "POST",
        body: formData,
      },
    );
  }

  return apiRequest<{ message: GleencMessage }>(
    `/messages/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: "POST",
      body: JSON.stringify({ body }),
    },
  );
}
