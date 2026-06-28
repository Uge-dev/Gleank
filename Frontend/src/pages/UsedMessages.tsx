import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { FiMessageCircle, FiSend } from "react-icons/fi";

import EmptyState from "../components/EmptyState";
import LoadingState from "../components/LoadingState";
import { useAuth } from "../context/AuthContext";
import {
  getConversationMessages,
  getConversations,
  sendConversationMessage,
} from "../services/message.service";
import type { GleankConversation, GleankMessage } from "../types/domain";
import { resolveMediaUrl } from "../utils/media";

const usedFallback =
  "https://images.unsplash.com/photo-1523206489230-c012c64b2b48?auto=format&fit=crop&w=900&q=80";

function UsedMessages() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState<GleankConversation[]>([]);
  const [messages, setMessages] = useState<GleankMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [body, setBody] = useState("");
  const activeConversationId = searchParams.get("conversation") || "";

  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeConversationId) || null,
    [activeConversationId, conversations],
  );

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    void getConversations()
      .then((response) => {
        if (!active) return;
        const usedConversations = response.conversations.filter((item) => item.contextType.startsWith("used"));
        setConversations(usedConversations);
        if (!activeConversationId && usedConversations[0]) {
          setSearchParams({ conversation: usedConversations[0].id });
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activeConversationId, setSearchParams]);

  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }

    let active = true;
    void getConversationMessages(activeConversationId).then((response) => {
      if (active) setMessages(response.messages);
    });
    return () => {
      active = false;
    };
  }, [activeConversationId]);

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = body.trim();
    if (!activeConversationId || !clean) return;

    setIsSending(true);
    try {
      const response = await sendConversationMessage(activeConversationId, clean);
      setMessages((current) => [...current, response.message]);
      setBody("");
    } finally {
      setIsSending(false);
    }
  }

  if (isLoading) {
    return (
      <section className="used-messages-page">
        <LoadingState title="Loading used-item messages" message="Opening your buyer/seller inbox." />
      </section>
    );
  }

  return (
    <section className="used-messages-page">
      <div className="used-flow-hero compact">
        <span><FiMessageCircle /> Used Market Messages</span>
        <h1>Message buyers and sellers around specific used items.</h1>
      </div>

      <div className="used-messages-layout">
        <aside className="used-conversation-list">
          {conversations.length === 0 ? (
            <EmptyState icon={<FiMessageCircle />} title="No messages yet" message="Start from a used item details page." />
          ) : (
            conversations.map((conversation) => (
              <button
                type="button"
                key={conversation.id}
                className={conversation.id === activeConversationId ? "active" : ""}
                onClick={() => setSearchParams({ conversation: conversation.id })}
              >
                <img src={resolveMediaUrl(conversation.listingImageUrl, usedFallback)} alt={conversation.listingName || "Used item"} />
                <div>
                  <strong>{conversation.otherUserName}</strong>
                  <span>{conversation.listingName || "Used Market chat"}</span>
                  <p>{conversation.lastMessageBody || "No message yet"}</p>
                </div>
              </button>
            ))
          )}
        </aside>

        <main className="used-chat-panel">
          {activeConversation ? (
            <>
              <header>
                <img src={resolveMediaUrl(activeConversation.listingImageUrl, usedFallback)} alt={activeConversation.listingName} />
                <div>
                  <strong>{activeConversation.listingName || "Used Market conversation"}</strong>
                  <span>Chat with {activeConversation.otherUserName}</span>
                </div>
              </header>

              <div className="used-chat-messages">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={message.senderId === user?.id ? "mine" : "theirs"}
                  >
                    <span>{message.senderName}</span>
                    <p>{message.body}</p>
                  </div>
                ))}
              </div>

              <form onSubmit={handleSend} className="used-chat-form">
                <input
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="Type message..."
                />
                <button type="submit" disabled={isSending || !body.trim()}>
                  <FiSend />
                </button>
              </form>
            </>
          ) : (
            <EmptyState icon={<FiMessageCircle />} title="Select a conversation" message="Used item conversations appear here." />
          )}
        </main>
      </div>
    </section>
  );
}

export default UsedMessages;
