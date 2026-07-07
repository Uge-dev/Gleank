import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { FiArrowLeft, FiImage, FiMessageCircle, FiSend, FiSmile } from "react-icons/fi";

import EmptyState from "../components/EmptyState";
import LoadingState from "../components/LoadingState";
import { useAuth } from "../context/AuthContext";
import {
  getConversationMessages,
  getConversations,
  sendConversationMessage,
} from "../services/message.service";
import type { GleencConversation, GleencMessage } from "../types/domain";
import { resolveMediaUrl } from "../utils/media";

const usedFallback =
  "https://images.unsplash.com/photo-1523206489230-c012c64b2b48?auto=format&fit=crop&w=900&q=80";

const chatEmojis = ["😀", "😂", "😍", "🔥", "👏", "🙏", "💚", "💯", "😭", "🤝", "👍", "✨"];

function UsedMessages() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState<GleencConversation[]>([]);
  const [messages, setMessages] = useState<GleencMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [body, setBody] = useState("");
  const [selectedAttachment, setSelectedAttachment] = useState<File | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const bodyInputRef = useRef<HTMLInputElement | null>(null);
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
    if (!activeConversationId || (!clean && !selectedAttachment)) return;

    setIsSending(true);
    try {
      const response = await sendConversationMessage(
        activeConversationId,
        clean,
        selectedAttachment,
      );
      setMessages((current) => [...current, response.message]);
      setBody("");
      setSelectedAttachment(null);
      setEmojiOpen(false);
    } finally {
      setIsSending(false);
    }
  }

  function addEmoji(emoji: string) {
    setBody((current) => `${current}${emoji}`);
    setEmojiOpen(false);
    window.setTimeout(() => bodyInputRef.current?.focus(), 0);
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

      <div className={activeConversationId ? "used-messages-layout chat-open" : "used-messages-layout"}>
        <aside className="used-conversation-list">
          {conversations.length === 0 ? (
            <EmptyState icon={<FiMessageCircle />} title="No messages yet" message="Start from a used item details page." />
          ) : (
            conversations.map((conversation) => (
              <button
                type="button"
                key={conversation.id}
                className={conversation.id === activeConversationId ? "active" : ""}
                onClick={() => {
                  setSearchParams({ conversation: conversation.id });
                  setEmojiOpen(false);
                  setSelectedAttachment(null);
                }}
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
                <button
                  type="button"
                  className="used-chat-back"
                  onClick={() => setSearchParams({})}
                  aria-label="Back to used market conversations"
                >
                  <FiArrowLeft />
                </button>
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
                    {message.body && <p>{message.body}</p>}
                    {message.attachmentUrl && (
                      <img
                        className="chat-attachment-image"
                        src={resolveMediaUrl(message.attachmentUrl, "")}
                        alt="Message attachment"
                      />
                    )}
                  </div>
                ))}
              </div>

              <form onSubmit={handleSend} className="used-chat-form">
                <input
                  ref={attachmentInputRef}
                  type="file"
                  accept="image/*"
                  className="chat-file-input"
                  onChange={(event) => {
                    setSelectedAttachment(event.target.files?.[0] || null);
                    event.currentTarget.value = "";
                  }}
                />
                <button
                  type="button"
                  className="used-chat-icon-button"
                  onClick={() => attachmentInputRef.current?.click()}
                  aria-label="Attach image"
                >
                  <FiImage />
                </button>
                <input
                  ref={bodyInputRef}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="Type message..."
                />
                <button
                  type="button"
                  className="used-chat-icon-button"
                  onClick={() => setEmojiOpen((open) => !open)}
                  aria-label="Add emoji"
                >
                  <FiSmile />
                </button>
                <button type="submit" disabled={isSending || (!body.trim() && !selectedAttachment)}>
                  <FiSend />
                </button>

                {emojiOpen && (
                  <div className="chat-emoji-panel used-chat-emoji-panel" role="listbox" aria-label="Choose emoji">
                    {chatEmojis.map((emoji) => (
                      <button type="button" key={emoji} onClick={() => addEmoji(emoji)}>
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}

                {selectedAttachment && (
                  <div className="chat-attachment-preview used-chat-attachment-preview">
                    <span>{selectedAttachment.name}</span>
                    <button type="button" onClick={() => setSelectedAttachment(null)}>
                      Remove
                    </button>
                  </div>
                )}
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
