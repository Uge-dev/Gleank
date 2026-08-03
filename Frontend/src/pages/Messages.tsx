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
  previewConversation,
  getConversationMessages,
  getConversations,
  sendConversationMessage,
  sendDraftConversationMessage,
} from "../services/message.service";
import type {
  GleencConversation,
  GleencMessage,
  GleencMessageContext,
} from "../types/domain";
import type { MessagePortal } from "../services/message.service";
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
const activePresenceWindowMs = 5 * 60 * 1000;

function formatChatTime(value?: string | null) {
  if (!value) return "Now";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Now";

  return new Intl.DateTimeFormat("en-NG", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatContextPrice(priceKobo: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number(priceKobo || 0) / 100);
}

function conversationName(conversation: GleencConversation) {
  if (conversation.contextType === "support") {
    return conversation.otherUserName || "Gleenc Support";
  }

  return conversation.otherUserName || "Gleenc user";
}

function conversationHandle(conversation: GleencConversation) {
  if (conversation.contextType === "support") return "gleenc-support";
  if (conversation.otherUserRole === "rider") return "rider";
  if (conversation.otherUserRole === "seller" && conversation.storeSlug) {
    return conversation.storeSlug;
  }

  return conversation.otherUserRole === "buyer"
    ? "buyer-account"
    : conversation.otherUserRole.replaceAll("_", "-");
}

function conversationIdentityLine(conversation: GleencConversation) {
  if (conversation.contextType === "support") return "Official Gleenc admin support";

  if (conversation.otherUserRole === "seller") {
    const storeIdentity = conversation.storeName ||
      (conversation.storeSlug ? `@${conversation.storeSlug}` : "Seller account");
    return conversation.storeSlug && conversation.storeName
      ? `${conversation.storeName} • @${conversation.storeSlug}`
      : storeIdentity;
  }

  if (conversation.otherUserRole === "rider") return "@rider";
  if (conversation.otherUserRole === "admin") return "Gleenc administrator";
  return "Buyer account";
}

function conversationProfileHref(conversation: GleencConversation) {
  if (conversation.contextType === "support") return "/help";
  if (conversation.otherUserRole === "seller" && conversation.storeSlug) {
    return `/stores/${conversation.storeSlug}`;
  }
  return "/messages";
}

function conversationAvatar(conversation: GleencConversation) {
  const name = conversationName(conversation);
  return name.slice(0, 1).toUpperCase();
}

function conversationImage(conversation: GleencConversation) {
  const profileImage = conversation.otherUserAvatarUrl;
  const sellerFallback =
    conversation.otherUserRole === "seller" ? conversation.storeLogoUrl : null;

  return resolveMediaUrl(profileImage || sellerFallback, "");
}

function conversationIsActive(conversation: GleencConversation) {
  if (!conversation.lastMessageAt) return false;
  const lastSeen = new Date(conversation.lastMessageAt).getTime();
  if (Number.isNaN(lastSeen)) return false;
  return Date.now() - lastSeen <= activePresenceWindowMs;
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

type MessageWorkspaceProps = {
  currentUserId?: string;
  portal?: MessagePortal;
  messagesPath?: string;
  authReady?: boolean;
  authenticated?: boolean;
};

export function MessageWorkspace({
  currentUserId,
  portal = "user",
  messagesPath = "/messages",
  authReady = true,
  authenticated = true,
}: MessageWorkspaceProps) {
  const [searchParams] = useSearchParams();
  const [conversationList, setConversationList] = useState<
    GleencConversation[]
  >([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const [messages, setMessages] = useState<GleencMessage[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<MessageFilter>("All");
  const [messageText, setMessageText] = useState("");
  const [draftContext, setDraftContext] = useState<GleencMessageContext | null>(null);
  const [draftTarget, setDraftTarget] = useState<{
    contextType: "product" | "used_listing" | "used_order" | "store" | "order" | "delivery_assignment" | "delivery_offer";
    contextId?: string;
  } | null>(null);
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
  const draftConversationRef = useRef<GleencConversation | null>(null);

  const loadConversations = useCallback(
    async (preferredConversationId = "") => {
      const response = await getConversations(portal);
      setConversationList(() => {
        const draft = draftConversationRef.current;
        return draft && !response.conversations.some((item) => item.id === draft.id)
          ? [...response.conversations, draft]
          : response.conversations;
      });

      setActiveConversationId((current) => {
        if (draftConversationRef.current?.id === current) {
          return current;
        }
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
    [portal],
  );

  useEffect(() => {
    if (!authReady || !authenticated) {
      setIsLoading(false);
      return;
    }
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
  }, [authReady, authenticated, loadConversations]);

  useEffect(() => {
    const sellerSlug = searchParams.get("seller")?.trim() || "";
    const orderId = searchParams.get("order")?.trim() || "";
    const productId = searchParams.get("product")?.trim() || "";
    const listingId = searchParams.get("listing")?.trim() || "";
    const usedOrderId = searchParams.get("usedOrder")?.trim() || "";
    const assignmentId = searchParams.get("assignment")?.trim() || "";
    const offerId = searchParams.get("offer")?.trim() || "";
    const requestedConversationId = searchParams.get("conversation")?.trim() || "";
    const supportRequested = searchParams.get("support") === "1";
    const contextKey = supportRequested
      ? "support"
      : requestedConversationId
        ? `conversation:${requestedConversationId}`
      : orderId
        ? `order:${orderId}`
        : usedOrderId
          ? `used-order:${usedOrderId}`
        : productId
          ? `product:${productId}`
      : listingId
        ? `listing:${listingId}`
        : assignmentId
          ? `assignment:${assignmentId}`
        : offerId
          ? `offer:${offerId}`
        : sellerSlug
          ? `store:${sellerSlug}`
          : "";

    if (!authReady || !authenticated || !contextKey || openedContextRef.current === contextKey) return;
    openedContextRef.current = contextKey;

    if (requestedConversationId) {
      void loadConversations(requestedConversationId)
        .then(() => {
          setActiveConversationId(requestedConversationId);
          setMobileChatOpen(true);
        })
        .catch((requestError) => {
          openedContextRef.current = "";
          setError(requestError instanceof Error ? requestError.message : "Conversation could not be opened.");
        });
      return;
    }

    const input = supportRequested
      ? { contextType: "support" as const }
      : orderId
        ? { contextType: "order" as const, contextId: orderId }
        : usedOrderId
          ? { contextType: "used_order" as const, contextId: usedOrderId }
        : productId
          ? { contextType: "product" as const, contextId: productId }
          : listingId
            ? { contextType: "used_listing" as const, contextId: listingId }
            : assignmentId
              ? { contextType: "delivery_assignment" as const, contextId: assignmentId }
              : offerId
                ? { contextType: "delivery_offer" as const, contextId: offerId }
        : { contextType: "store" as const, contextId: sellerSlug };
    const previewInput = input as {
      contextType: "product" | "used_listing" | "used_order" | "store" | "order" | "delivery_assignment" | "delivery_offer";
      contextId?: string;
    };

    const openConversation = supportRequested
      ? createConversation(input, portal)
      : previewConversation(previewInput, portal);

    void openConversation
      .then(async (response) => {
        if (supportRequested) {
          await loadConversations(response.conversation.id);
        } else {
          setConversationList((current) => [
            ...current.filter((item) => item.id !== response.conversation.id),
            response.conversation,
          ]);
          if (response.conversation.isDraft) {
            draftConversationRef.current = response.conversation;
            setDraftTarget(previewInput);
          } else {
            draftConversationRef.current = null;
            setDraftTarget(null);
          }
        }
        setActiveConversationId(response.conversation.id);
        setDraftContext(response.draftContext || null);
        if (response.draftContext) {
          const amount = new Intl.NumberFormat("en-NG", {
            style: "currency",
            currency: "NGN",
            maximumFractionDigits: 0,
          }).format(response.draftContext.priceKobo / 100);
          setMessageText(`I'm interested in ${response.draftContext.name} (${amount}).`);
        }
        setMobileChatOpen(true);
      })
      .catch((requestError) => {
        openedContextRef.current = "";
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Conversation could not be opened.",
        );
      });
  }, [authReady, authenticated, loadConversations, portal, searchParams]);

  const activeConversation = useMemo(() => {
    return conversationList.find(
      (conversation) => conversation.id === activeConversationId,
    );
  }, [activeConversationId, conversationList]);

  const loadMessages = useCallback(async (conversationId: string, silent = false) => {
    if (conversationId.startsWith("draft:")) {
      setMessages([]);
      return;
    }
    if (!silent) setIsLoadingMessages(true);

    try {
      const response = await getConversationMessages(conversationId, portal);
      setMessages(response.messages);
    } finally {
      if (!silent) setIsLoadingMessages(false);
    }
  }, [portal]);

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
      if (document.visibilityState === "visible" && navigator.onLine) {
        void loadMessages(activeConversationId, true).catch(() => undefined);
      }
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
      if (activeFilter === "Sellers") return conversation.otherUserRole === "seller";

      return true;
    });
  }, [activeFilter, conversationList, searchTerm]);

  function selectConversation(conversation: GleencConversation) {
    setActiveConversationId(conversation.id);
    setMobileChatOpen(true);
    setEmojiOpen(false);
    setSelectedAttachment(null);
    setDraftContext(null);
    setDraftTarget(null);
    draftConversationRef.current = null;
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
      const response = activeConversation.isDraft && draftTarget
        ? await sendDraftConversationMessage({
            ...draftTarget,
            body: cleanMessage,
            attachment: selectedAttachment,
            messageContext: draftContext,
          }, portal)
        : await sendConversationMessage(
            activeConversation.id,
            cleanMessage,
            selectedAttachment,
            draftContext,
            portal,
          );
      setMessages((current) => [...current, response.message]);
      setActiveConversationId(response.conversation?.id || activeConversation.id);
      setConversationList((current) => [
        ...current.filter((item) => item.id !== activeConversation.id && item.id !== response.conversation?.id),
        response.conversation || activeConversation,
      ]);
      setMessageText("");
      setSelectedAttachment(null);
      setDraftContext(null);
      setDraftTarget(null);
      draftConversationRef.current = null;
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

  if (!authReady || isLoading) {
    return (
      <section className="messages-page">
        <LoadingState
          title="Loading messages"
          message="Opening your live Gleenc inbox."
        />
      </section>
    );
  }

  if (!authenticated) {
    return (
      <section className="messages-page messages-empty-page">
        <EmptyState
          icon={<FiMessageCircle />}
          eyebrow="Sign in required"
          title="Please log in to continue"
          message="Sign in with the account that owns this inbox."
          actionLabel="Log in"
          onAction={() => {
            window.location.href = `/login?redirect=${encodeURIComponent(messagesPath)}`;
          }}
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
            window.location.href = `${messagesPath}?support=1`;
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
              {/not allowed|spam|privacy and policy/i.test(error) ? (
                <Link to="/help">Review Privacy and Policy</Link>
              ) : null}
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

                      {conversationIsActive(conversation) && <small />}
                    </div>

                    <div className="conversation-info">
                      <div className="conversation-top-line">
                        <strong>{name}</strong>
                        <time>{formatChatTime(conversation.lastMessageAt)}</time>
                      </div>

                      <p className="conversation-account-line">
                        {conversationIdentityLine(conversation)}
                      </p>

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
                to={conversationProfileHref(activeConversation)}
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

                  {conversationIsActive(activeConversation) && <small />}
                </div>

                <div>
                  <h2>{conversationName(activeConversation)}</h2>
                  <p>Live chat • {conversationIdentityLine(activeConversation)}</p>
                </div>
              </Link>

              <div className="chat-header-actions">
                <Link
                  to={conversationProfileHref(activeConversation)}
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

              {messages.map((message) => {
                const isMine = message.senderId === currentUserId;
                const senderAvatar = resolveMediaUrl(message.senderAvatarUrl, "");

                return (
                  <div
                    key={message.id}
                    className={isMine ? "message-bubble-row mine" : "message-bubble-row"}
                  >
                    {!isMine && (
                      <span className="message-sender-avatar" aria-hidden="true">
                        {senderAvatar ? (
                          <img src={senderAvatar} alt="" />
                        ) : (
                          message.senderName.slice(0, 1).toUpperCase()
                        )}
                      </span>
                    )}
                    <div className="message-bubble">
                      {!isMine && (
                        <strong>
                          {message.senderName}{message.senderRole === "rider" ? " • @rider" : ""}
                        </strong>
                      )}
                      {message.context && (
                        <Link className="message-product-context" to={message.context.href}>
                          {message.context.imageUrl ? (
                            <img
                              src={resolveMediaUrl(message.context.imageUrl, chatFallback)}
                              alt={message.context.name}
                            />
                          ) : (
                            <span><FiShoppingBag /></span>
                          )}
                          <span>
                            <small>{message.context.type === "product" ? "Product" : "Used item"}</small>
                            <strong>{message.context.name}</strong>
                            <em>{formatContextPrice(message.context.priceKobo)}</em>
                          </span>
                        </Link>
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
                          const tickState = getMessageTickState(message, currentUserId);

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
                );
              })}

              <div ref={messageEndRef} />
            </div>

            <div className="chat-input-panel">
              {draftContext && (
                <div className="chat-draft-context">
                  <img
                    src={resolveMediaUrl(draftContext.imageUrl, chatFallback)}
                    alt={draftContext.name}
                  />
                  <span>
                    <small>Ready to send</small>
                    <strong>{draftContext.name}</strong>
                    <em>{formatContextPrice(draftContext.priceKobo)}</em>
                  </span>
                  <button type="button" onClick={() => setDraftContext(null)}>
                    Remove
                  </button>
                </div>
              )}
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
                disabled={isSending || (!messageText.trim() && !selectedAttachment && !draftContext)}
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

function Messages() {
  const { user, isLoading } = useAuth();
  return (
    <MessageWorkspace
      currentUserId={user?.id}
      authReady={!isLoading}
      authenticated={Boolean(user)}
    />
  );
}

export default Messages;
