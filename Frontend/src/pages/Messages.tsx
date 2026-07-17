import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  FiArrowLeft,
  FiImage,
  FiInfo,
  FiMessageCircle,
  FiMoreHorizontal,
  FiSearch,
  FiSend,
  FiShoppingBag,
  FiSmile,
  FiUser,
} from "react-icons/fi";

import EmptyState from "../components/EmptyState";
import LoadingState from "../components/LoadingState";
import { useAuth } from "../context/AuthContext";
import {
  createConversation,
  getConversationMessages,
  getConversations,
  sendConversationMessage,
} from "../services/message.service";
import type { GleencConversation, GleencMessage } from "../types/domain";
import { resolveMediaUrl } from "../utils/media";

type MessageFilter = "All" | "Unread" | "Orders" | "Sellers" | "Support";

const messageFilters: MessageFilter[] = [
  "All",
  "Unread",
  "Orders",
  "Sellers",
  "Support",
];

const chatEmojis = ["😀", "😂", "😍", "🔥", "👏", "🙏", "💚", "💯", "😭", "🤝", "👍", "✨"];

const chatFallback =
  "https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=600&q=80";

function formatChatTime(value?: string | null) {
  if (!value) return "Now";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Now";

  return new Intl.DateTimeFormat("en-NG", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function conversationName(conversation: GleencConversation) {
  if (conversation.contextType === "support") return "Gleenc Support";
  return (
    conversation.otherUserName ||
    conversation.storeName ||
    conversation.sellerName ||
    "Gleenc user"
  );
}

function conversationHandle(conversation: GleencConversation) {
  if (conversation.contextType === "support") return "support";
  return conversation.storeSlug || conversation.contextType.replaceAll("_", "-");
}

function conversationAvatar(conversation: GleencConversation) {
  const name = conversationName(conversation);
  return name.slice(0, 1).toUpperCase();
}

function conversationImage(conversation: GleencConversation) {
  return resolveMediaUrl(
    conversation.storeLogoUrl || conversation.listingImageUrl,
    "",
  );
}

function conversationCampus(conversation: GleencConversation) {
  if (conversation.contextType === "support") return "Admin support";
  return conversation.storeCampus || "Campus chat";
}

function conversationPreview(conversation: GleencConversation) {
  if (conversation.contextType === "support") {
    return {
      id: conversation.id,
      href: "/help",
      name: "Gleenc admin support",
      price: "Live help",
      image: chatFallback,
      status: "Support",
    };
  }

  if (conversation.orderId) {
    return {
      id: conversation.orderId,
      href: `/orders/${conversation.orderId}`,
      name: `Order ${conversation.orderId.slice(-8).toUpperCase()}`,
      price: "Order conversation",
      image: resolveMediaUrl(conversation.storeLogoUrl, chatFallback),
      status: "Order",
    };
  }

  if (conversation.listingId) {
    return {
      id: conversation.listingId,
      href: `/used-market/${conversation.listingId}`,
      name: conversation.listingName || "Used-market item",
      price: "Used Market",
      image: resolveMediaUrl(conversation.listingImageUrl, chatFallback),
      status: conversation.contextType === "used_order" ? "Used Order" : "Used Item",
    };
  }

  return {
    id: conversation.contextId,
    href: conversation.storeSlug
      ? `/stores/${conversation.storeSlug}`
      : "/search",
    name: conversation.storeName || conversationName(conversation),
    price: conversation.storeCategory || "Store chat",
    image: resolveMediaUrl(conversation.storeLogoUrl, chatFallback),
    status: "Store",
  };
}

function getMessageTickState(message: GleencMessage, currentUserId?: string) {
  if (!currentUserId) return null;
  if (message.isRead) return "read";
  if (
    message.senderId === currentUserId &&
    typeof navigator !== "undefined" &&
    !navigator.onLine
  ) {
    return "offline";
  }
  return "delivered";
}

function Messages() {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [conversationList, setConversationList] = useState<
    GleencConversation[]
  >([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const [messages, setMessages] = useState<GleencMessage[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<MessageFilter>("All");
  const [messageText, setMessageText] = useState("");
  const [selectedAttachment, setSelectedAttachment] = useState<File | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");

  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const openedContextRef = useRef("");

  const loadConversations = useCallback(
    async (preferredConversationId = "") => {
      const response = await getConversations();
      setConversationList(response.conversations);

      setActiveConversationId((current) => {
        if (
          preferredConversationId &&
          response.conversations.some((item) => item.id === preferredConversationId)
        ) {
          return preferredConversationId;
        }

        if (current && response.conversations.some((item) => item.id === current)) {
          return current;
        }

        return response.conversations[0]?.id || "";
      });
    },
    [],
  );

  useEffect(() => {
    let active = true;

    setIsLoading(true);
    setError("");

    void loadConversations()
      .catch((requestError) => {
        if (!active) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Messages could not be loaded.",
        );
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    const timer = window.setInterval(() => {
      void loadConversations().catch(() => undefined);
    }, 5000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [loadConversations]);

  useEffect(() => {
    const sellerSlug = searchParams.get("seller")?.trim() || "";
    const orderId = searchParams.get("order")?.trim() || "";
    const supportRequested = searchParams.get("support") === "1";
    const contextKey = supportRequested
      ? "support"
      : orderId
        ? `order:${orderId}`
        : sellerSlug
          ? `store:${sellerSlug}`
          : "";

    if (!contextKey || openedContextRef.current === contextKey) return;
    openedContextRef.current = contextKey;

    const input = supportRequested
      ? { contextType: "support" as const }
      : orderId
        ? { contextType: "order" as const, contextId: orderId }
        : { contextType: "store" as const, contextId: sellerSlug };

    void createConversation(input)
      .then(async (response) => {
        await loadConversations(response.conversation.id);
        setActiveConversationId(response.conversation.id);
        setMobileChatOpen(true);
      })
      .catch((requestError) => {
        openedContextRef.current = "";
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Conversation could not be started.",
        );
      });
  }, [loadConversations, searchParams]);

  const activeConversation = useMemo(() => {
    return conversationList.find(
      (conversation) => conversation.id === activeConversationId,
    );
  }, [activeConversationId, conversationList]);

  const loadMessages = useCallback(async (conversationId: string) => {
    setIsLoadingMessages(true);

    try {
      const response = await getConversationMessages(conversationId);
      setMessages(response.messages);
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }

    let active = true;

    void loadMessages(activeConversationId).catch((requestError) => {
      if (!active) return;
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Conversation messages could not be loaded.",
      );
    });

    const timer = window.setInterval(() => {
      void loadMessages(activeConversationId).catch(() => undefined);
    }, 2500);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [activeConversationId, loadMessages]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [activeConversationId, messages.length]);

  const filteredConversations = useMemo(() => {
    return conversationList.filter((conversation) => {
      const searchValue = searchTerm.toLowerCase();
      const name = conversationName(conversation);
      const preview = conversationPreview(conversation);
      const matchesSearch =
        !searchValue ||
        name.toLowerCase().includes(searchValue) ||
        conversationHandle(conversation).toLowerCase().includes(searchValue) ||
        preview.name.toLowerCase().includes(searchValue) ||
        (conversation.lastMessageBody || "").toLowerCase().includes(searchValue);

      if (!matchesSearch) return false;

      if (activeFilter === "Unread") return conversation.unreadCount > 0;
      if (activeFilter === "Orders") return Boolean(conversation.orderId);
      if (activeFilter === "Support") return conversation.contextType === "support";
      if (activeFilter === "Sellers") return conversation.contextType !== "support";

      return true;
    });
  }, [activeFilter, conversationList, searchTerm]);

  function selectConversation(conversation: GleencConversation) {
    setActiveConversationId(conversation.id);
    setMobileChatOpen(true);
    setEmojiOpen(false);
    setSelectedAttachment(null);
  }

  function addEmoji(emoji: string) {
    setMessageText((current) => `${current}${emoji}`);
    setEmojiOpen(false);
    window.setTimeout(() => messageInputRef.current?.focus(), 0);
  }

  async function sendMessage() {
    const cleanMessage = messageText.trim();

    if ((!cleanMessage && !selectedAttachment) || !activeConversation || isSending) return;

    setIsSending(true);
    setError("");

    try {
      const response = await sendConversationMessage(
        activeConversation.id,
        cleanMessage,
        selectedAttachment,
      );
      setMessages((current) => [...current, response.message]);
      setMessageText("");
      setSelectedAttachment(null);
      setEmojiOpen(false);
      await loadConversations(activeConversation.id);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Message could not be sent.",
      );
    } finally {
      setIsSending(false);
    }
  }

  if (isLoading) {
    return (
      <section className="messages-page">
        <LoadingState
          title="Loading messages"
          message="Opening your live Gleenc inbox."
        />
      </section>
    );
  }

  if (conversationList.length === 0 && !error) {
    return (
      <section className="messages-page messages-empty-page">
        <EmptyState
          icon={<FiMessageCircle />}
          eyebrow="No messages yet"
          title="Your inbox is empty"
          message="When you message sellers, buyers, or Gleenc support, your conversations will appear here."
          actionLabel="Chat with support"
          onAction={() => {
            window.location.href = "/messages?support=1";
          }}
        />
      </section>
    );
  }

  return (
    <section className="messages-page">
      <div
        className={
          mobileChatOpen ? "messages-layout chat-open" : "messages-layout"
        }
      >
        <aside className="messages-sidebar-panel">
          <div className="messages-sidebar-header">
            <div>
              <span>Live Inbox</span>
              <h1>Messages</h1>
            </div>

            <button type="button" aria-label="Message options">
              <FiMoreHorizontal />
            </button>
          </div>

          {error && (
            <div className="messages-inline-error" role="alert">
              {error}
            </div>
          )}

          <div className="messages-search-box">
            <FiSearch />

            <input
              type="text"
              placeholder="Search sellers, support, orders..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>

          <div className="messages-filter-row">
            {messageFilters.map((filter) => (
              <button
                type="button"
                key={filter}
                className={activeFilter === filter ? "active" : ""}
                onClick={() => setActiveFilter(filter)}
              >
                {filter}
              </button>
            ))}
          </div>

          <div className="conversation-list">
            {filteredConversations.length > 0 ? (
              filteredConversations.map((conversation) => {
                const name = conversationName(conversation);
                const image = conversationImage(conversation);
                const preview = conversationPreview(conversation);

                return (
                  <button
                    type="button"
                    key={conversation.id}
                    className={
                      activeConversationId === conversation.id
                        ? "conversation-card active"
                        : "conversation-card"
                    }
                    onClick={() => selectConversation(conversation)}
                  >
                    <div className="conversation-avatar-wrap">
                      {image ? (
                        <img src={image} alt={name} />
                      ) : (
                        <span>{conversationAvatar(conversation)}</span>
                      )}

                      <small />
                    </div>

                    <div className="conversation-info">
                      <div className="conversation-top-line">
                        <strong>{name}</strong>
                        <time>{formatChatTime(conversation.lastMessageAt)}</time>
                      </div>

                      <p>@{conversationHandle(conversation)}</p>

                      <span>
                        {conversation.lastMessageBody ||
                          (conversation.contextType === "support"
                            ? "Open support conversation"
                            : "Start the conversation")}
                      </span>

                      <div className="conversation-product-line">
                        <FiShoppingBag />
                        {preview.name}
                      </div>
                    </div>

                    {conversation.unreadCount > 0 && (
                      <em>{conversation.unreadCount}</em>
                    )}
                  </button>
                );
              })
            ) : (
              <div className="messages-empty-list">
                <FiSearch />
                <h3>No conversation found</h3>
                <p>Try searching with another seller, order, or support term.</p>
              </div>
            )}
          </div>
        </aside>

        {activeConversation ? (
          <section className="chat-panel">
            <div className="chat-header">
              <button
                type="button"
                className="chat-mobile-back"
                onClick={() => setMobileChatOpen(false)}
                aria-label="Back to messages"
              >
                <FiArrowLeft />
              </button>

              <Link
                to={
                  activeConversation.contextType === "support"
                    ? "/help"
                    : activeConversation.storeSlug
                      ? `/stores/${activeConversation.storeSlug}`
                      : "/messages"
                }
                className="chat-seller-main"
              >
                <div className="chat-seller-avatar">
                  {conversationImage(activeConversation) ? (
                    <img
                      src={conversationImage(activeConversation)}
                      alt={conversationName(activeConversation)}
                    />
                  ) : (
                    <span>{conversationAvatar(activeConversation)}</span>
                  )}

                  <small />
                </div>

                <div>
                  <h2>{conversationName(activeConversation)}</h2>
                  <p>Polling live • {conversationCampus(activeConversation)}</p>
                </div>
              </Link>

              <div className="chat-header-actions">
                <Link
                  to={
                    activeConversation.storeSlug
                      ? `/stores/${activeConversation.storeSlug}`
                      : "/profile"
                  }
                  aria-label="View profile"
                >
                  <FiUser />
                </Link>

                <button type="button" aria-label="Chat info">
                  <FiInfo />
                </button>
              </div>
            </div>

            <div className="chat-product-preview">
              {(() => {
                const preview = conversationPreview(activeConversation);

                return (
                  <>
                    <img src={preview.image} alt={preview.name} />

                    <div>
                      <span>{preview.status}</span>
                      <h3>{preview.name}</h3>
                      <p>{preview.price}</p>
                    </div>

                    <Link to={preview.href}>View</Link>
                  </>
                );
              })()}
            </div>

            <div className="chat-message-area">
              <div className="chat-date-divider">
                <span>{isLoadingMessages ? "Syncing..." : "Live chat"}</span>
              </div>

              {messages.map((message) => (
                <div
                  key={message.id}
                  className={
                    message.senderId === user?.id
                      ? "message-bubble-row mine"
                      : "message-bubble-row"
                  }
                >
                  <div className="message-bubble">
                    {message.senderId !== user?.id && (
                      <strong>{message.senderName}</strong>
                    )}
                    {message.body && <p>{message.body}</p>}
                    {message.attachmentUrl && (
                      <img
                        className="chat-attachment-image"
                        src={resolveMediaUrl(message.attachmentUrl, "")}
                        alt="Message attachment"
                      />
                    )}
                    <span className="message-meta-line">
                      <time>{formatChatTime(message.createdAt)}</time>
                      {(() => {
                        const tickState = getMessageTickState(message, user?.id);

                        if (!tickState) return null;

                        return (
                          <span
                            className={`message-tick-status ${tickState}`}
                            aria-label={
                              tickState === "read"
                                ? "Message read"
                                : tickState === "delivered"
                                  ? "Message delivered"
                                  : "Message sent"
                            }
                          >
                            {tickState === "offline" ? "✓" : "✓✓"}
                          </span>
                        );
                      })()}
                    </span>
                  </div>
                </div>
              ))}

              <div ref={messageEndRef} />
            </div>

            <div className="chat-input-panel">
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
                aria-label="Attach image"
                onClick={() => attachmentInputRef.current?.click()}
              >
                <FiImage />
              </button>

              <div className="chat-input-box">
                <textarea
                  ref={messageInputRef}
                  placeholder="Write a message..."
                  value={messageText}
                  onChange={(event) => setMessageText(event.target.value)}
                  rows={1}
                  enterKeyHint="enter"
                />

                <button
                  type="button"
                  aria-label="Add emoji"
                  onClick={() => setEmojiOpen((open) => !open)}
                >
                  <FiSmile />
                </button>

                {emojiOpen && (
                  <div className="chat-emoji-panel" role="listbox" aria-label="Choose emoji">
                    {chatEmojis.map((emoji) => (
                      <button
                        type="button"
                        key={emoji}
                        onClick={() => addEmoji(emoji)}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                className="chat-send-button"
                onClick={() => void sendMessage()}
                aria-label="Send message"
                disabled={isSending || (!messageText.trim() && !selectedAttachment)}
              >
                <FiSend />
              </button>

              {selectedAttachment && (
                <div className="chat-attachment-preview">
                  <span>{selectedAttachment.name}</span>
                  <button type="button" onClick={() => setSelectedAttachment(null)}>
                    Remove
                  </button>
                </div>
              )}
            </div>
          </section>
        ) : (
          <section className="chat-panel chat-empty-panel">
            <div>
              <FiShoppingBag />
            </div>

            <h2>Select a conversation</h2>

            <p>
              Choose a seller, order, or support conversation from the list to
              start chatting.
            </p>
          </section>
        )}
      </div>
    </section>
  );
}

export default Messages;
