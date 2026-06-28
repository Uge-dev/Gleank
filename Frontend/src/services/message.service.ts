import { apiRequest } from "../lib/api";
import type { GleankConversation, GleankMessage } from "../types/domain";

export function getConversations() {
  return apiRequest<{ conversations: GleankConversation[] }>(
    "/messages/conversations",
  );
}

export function createConversation(input: {
  contextType: "used_listing" | "used_order";
  contextId: string;
}) {
  return apiRequest<{ conversation: GleankConversation }>(
    "/messages/conversations",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function getConversation(id: string) {
  return apiRequest<{ conversation: GleankConversation }>(
    `/messages/conversations/${encodeURIComponent(id)}`,
  );
}

export function getConversationMessages(conversationId: string) {
  return apiRequest<{ messages: GleankMessage[] }>(
    `/messages/conversations/${encodeURIComponent(conversationId)}/messages`,
  );
}

export function sendConversationMessage(conversationId: string, body: string) {
  return apiRequest<{ message: GleankMessage }>(
    `/messages/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: "POST",
      body: JSON.stringify({ body }),
    },
  );
}
