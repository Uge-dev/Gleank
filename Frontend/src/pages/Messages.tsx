import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  FiArrowLeft,
  FiImage,
  FiInfo,
  FiMessageCircle,
  FiMoreHorizontal,
  FiPaperclip,
  FiPhone,
  FiSearch,
  FiSend,
  FiShoppingBag,
  FiSmile,
  FiUser,
} from "react-icons/fi";

import EmptyState from "../components/EmptyState";
import { conversations } from "../data/messages";
import type { Conversation } from "../data/messages";
import { getPublicStore } from "../services/seller.service";
import { resolveMediaUrl } from "../utils/media";

type MessageFilter = "All" | "Unread" | "Orders" | "Sellers";

function getCurrentTime() {
  return new Intl.DateTimeFormat("en-NG", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
}

function Messages() {
  const [searchParams] = useSearchParams();
  const [conversationList, setConversationList] =
    useState<Conversation[]>(conversations);

  const [activeConversationId, setActiveConversationId] = useState(
    conversations[0]?.id || ""
  );

  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<MessageFilter>("All");
  const [messageText, setMessageText] = useState("");
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const openedSellerRef = useRef("");

  const filteredConversations = useMemo(() => {
    return conversationList.filter((conversation) => {
      const searchValue = searchTerm.toLowerCase();

      const matchesSearch =
        conversation.sellerName.toLowerCase().includes(searchValue) ||
        conversation.sellerUsername.toLowerCase().includes(searchValue) ||
        conversation.product.name.toLowerCase().includes(searchValue) ||
        conversation.category.toLowerCase().includes(searchValue) ||
        conversation.lastMessage.toLowerCase().includes(searchValue);

      if (!matchesSearch) return false;

      if (activeFilter === "Unread") {
        return conversation.unreadCount > 0;
      }

      if (activeFilter === "Orders") {
        return conversation.product.status.toLowerCase().includes("order");
      }

      if (activeFilter === "Sellers") {
        return true;
      }

      return true;
    });
  }, [conversationList, searchTerm, activeFilter]);

  const activeConversation = useMemo(() => {
    return conversationList.find(
      (conversation) => conversation.id === activeConversationId
    );
  }, [conversationList, activeConversationId]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [activeConversationId, activeConversation?.messages.length]);

  useEffect(() => {
    const sellerSlug = searchParams.get("seller")?.trim() || "";
    if (!sellerSlug || openedSellerRef.current === sellerSlug) return;
    openedSellerRef.current = sellerSlug;

    const existingConversation = conversationList.find(
      (conversation) => conversation.sellerUsername === sellerSlug,
    );
    if (existingConversation) {
      setActiveConversationId(existingConversation.id);
      setMobileChatOpen(true);
      return;
    }

    void getPublicStore(sellerSlug)
      .then((workspace) => {
        const product = workspace.products[0];
        const service = workspace.services[0];
        const name =
          searchParams.get("name")?.trim() || workspace.store.name;
        const conversation: Conversation = {
          id: `chat-${workspace.store.slug}`,
          sellerName: name,
          sellerUsername: workspace.store.slug,
          sellerAvatar: name.slice(0, 1).toUpperCase(),
          sellerImage: workspace.store.logoUrl || undefined,
          campus: workspace.store.campus,
          category: workspace.store.category,
          lastMessage: `Start a conversation with ${name}.`,
          lastMessageTime: "Now",
          unreadCount: 0,
          online: true,
          product: product
            ? {
                id: product.id,
                href: `/products/${product.id}`,
                name: product.name,
                price: new Intl.NumberFormat("en-NG", {
                  style: "currency",
                  currency: "NGN",
                  maximumFractionDigits: 0,
                }).format(product.price),
                image: resolveMediaUrl(
                  product.imageUrls[0],
                  "https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=500&q=80",
                ),
                status:
                  product.status === "out_of_stock" ? "Sold" : "Available",
              }
            : {
                id: service?.id || workspace.store.id,
                href: `/stores/${workspace.store.slug}`,
                name: service?.name || workspace.store.name,
                price: service
                  ? new Intl.NumberFormat("en-NG", {
                      style: "currency",
                      currency: "NGN",
                      maximumFractionDigits: 0,
                    }).format(service.price)
                  : "Contact seller",
                image: resolveMediaUrl(
                  service?.imageUrls[0] || workspace.store.logoUrl,
                  "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=500&q=80",
                ),
                status: service ? "Service" : "Available",
              },
          messages: [
            {
              id: `intro-${workspace.store.id}`,
              sender: "seller",
              text: `You are now messaging ${name}. Ask about products, services, pickup, or delivery.`,
              time: getCurrentTime(),
            },
          ],
        };

        setConversationList((current) => [conversation, ...current]);
        setActiveConversationId(conversation.id);
        setMobileChatOpen(true);
      })
      .catch(() => {
        openedSellerRef.current = "";
      });
  }, [conversationList, searchParams]);

  function selectConversation(conversation: Conversation) {
    setActiveConversationId(conversation.id);
    setMobileChatOpen(true);

    setConversationList((currentConversations) =>
      currentConversations.map((item) => {
        if (item.id !== conversation.id) return item;

        return {
          ...item,
          unreadCount: 0,
        };
      })
    );
  }

  function sendMessage() {
    const cleanMessage = messageText.trim();

    if (!cleanMessage || !activeConversation) return;

    const newMessage = {
      id: `msg-${Date.now()}`,
      sender: "me" as const,
      text: cleanMessage,
      time: getCurrentTime(),
    };

    setConversationList((currentConversations) =>
      currentConversations.map((conversation) => {
        if (conversation.id !== activeConversation.id) return conversation;

        return {
          ...conversation,
          lastMessage: cleanMessage,
          lastMessageTime: "Now",
          unreadCount: 0,
          messages: [...conversation.messages, newMessage],
        };
      })
    );

    setMessageText("");
  }

  if (conversationList.length === 0) {
    return (
      <section className="messages-page">
        <EmptyState
          icon={<FiMessageCircle />}
          eyebrow="No messages yet"
          title="Your inbox is empty"
          message="When you message sellers or buyers, your conversations will appear here."
          actionLabel="Browse Products"
          onAction={() => {
            window.location.href = "/search";
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
              <span>Inbox</span>
              <h1>Messages</h1>
            </div>

            <button type="button" aria-label="Message options">
              <FiMoreHorizontal />
            </button>
          </div>

          <div className="messages-search-box">
            <FiSearch />

            <input
              type="text"
              placeholder="Search sellers, products, messages..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>

          <div className="messages-filter-row">
            {(["All", "Unread", "Orders", "Sellers"] as MessageFilter[]).map(
              (filter) => (
                <button
                  type="button"
                  key={filter}
                  className={activeFilter === filter ? "active" : ""}
                  onClick={() => setActiveFilter(filter)}
                >
                  {filter}
                </button>
              )
            )}
          </div>

          <div className="conversation-list">
            {filteredConversations.length > 0 ? (
              filteredConversations.map((conversation) => (
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
                    {conversation.sellerImage ? (
                      <img
                        src={conversation.sellerImage}
                        alt={conversation.sellerName}
                      />
                    ) : (
                      <span>{conversation.sellerAvatar}</span>
                    )}

                    {conversation.online && <small />}
                  </div>

                  <div className="conversation-info">
                    <div className="conversation-top-line">
                      <strong>{conversation.sellerName}</strong>
                      <time>{conversation.lastMessageTime}</time>
                    </div>

                    <p>@{conversation.sellerUsername}</p>

                    <span>{conversation.lastMessage}</span>

                    <div className="conversation-product-line">
                      <FiShoppingBag />
                      {conversation.product.name}
                    </div>
                  </div>

                  {conversation.unreadCount > 0 && (
                    <em>{conversation.unreadCount}</em>
                  )}
                </button>
              ))
            ) : (
              <div className="messages-empty-list">
                <FiSearch />
                <h3>No conversation found</h3>
                <p>Try searching with another seller or product name.</p>
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
                to={`/stores/${activeConversation.sellerUsername}`}
                className="chat-seller-main"
              >
                <div className="chat-seller-avatar">
                  {activeConversation.sellerImage ? (
                    <img
                      src={activeConversation.sellerImage}
                      alt={activeConversation.sellerName}
                    />
                  ) : (
                    <span>{activeConversation.sellerAvatar}</span>
                  )}

                  {activeConversation.online && <small />}
                </div>

                <div>
                  <h2>{activeConversation.sellerName}</h2>
                  <p>
                    {activeConversation.online ? "Online" : "Offline"} •{" "}
                    {activeConversation.campus}
                  </p>
                </div>
              </Link>

              <div className="chat-header-actions">
                <button type="button" aria-label="Call seller">
                  <FiPhone />
                </button>

                <Link
                  to={`/stores/${activeConversation.sellerUsername}`}
                  aria-label="View seller profile"
                >
                  <FiUser />
                </Link>

                <button type="button" aria-label="Chat info">
                  <FiInfo />
                </button>
              </div>
            </div>

            <div className="chat-product-preview">
              <img
                src={activeConversation.product.image}
                alt={activeConversation.product.name}
              />

              <div>
                <span>{activeConversation.product.status}</span>
                <h3>{activeConversation.product.name}</h3>
                <p>{activeConversation.product.price}</p>
              </div>

              <Link
                to={
                  activeConversation.product.href ||
                  `/products/${activeConversation.product.id}`
                }
              >
                View
              </Link>
            </div>

            <div className="chat-message-area">
              <div className="chat-date-divider">
                <span>Today</span>
              </div>

              {activeConversation.messages.map((message) => (
                <div
                  key={message.id}
                  className={
                    message.sender === "me"
                      ? "message-bubble-row mine"
                      : "message-bubble-row"
                  }
                >
                  <div className="message-bubble">
                    <p>{message.text}</p>
                    <time>{message.time}</time>
                  </div>
                </div>
              ))}

              <div ref={messageEndRef} />
            </div>

            <div className="chat-input-panel">
              <button type="button" aria-label="Attach file">
                <FiPaperclip />
              </button>

              <button type="button" aria-label="Attach image">
                <FiImage />
              </button>

              <div className="chat-input-box">
                <textarea
                  placeholder="Write a message..."
                  value={messageText}
                  onChange={(event) => setMessageText(event.target.value)}
                  rows={1}
                  enterKeyHint="enter"
                />

                <button type="button" aria-label="Add emoji">
                  <FiSmile />
                </button>
              </div>

              <button
                type="button"
                className="chat-send-button"
                onClick={sendMessage}
                aria-label="Send message"
                disabled={!messageText.trim()}
              >
                <FiSend />
              </button>
            </div>
          </section>
        ) : (
          <section className="chat-panel chat-empty-panel">
            <div>
              <FiShoppingBag />
            </div>

            <h2>Select a conversation</h2>

            <p>
              Choose a seller or product conversation from the list to start
              chatting.
            </p>
          </section>
        )}
      </div>
    </section>
  );
}

export default Messages;
