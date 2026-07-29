import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, JSX } from "react";
import {
  FaBan,
  FaBars,
  FaBell,
  FaBoxOpen,
  FaChartLine,
  FaCheckCircle,
  FaClipboardList,
  FaCog,
  FaCommentDots,
  FaCreditCard,
  FaExclamationTriangle,
  FaEye,
  FaHistory,
  FaMoneyBillWave,
  FaPaperPlane,
  FaSearch,
  FaShieldAlt,
  FaShoppingBag,
  FaSignOutAlt,
  FaStore,
  FaTimes,
  FaTruck,
  FaUndo,
  FaUserShield,
  FaUsers,
} from "react-icons/fa";
import {
  emptyAdminDataset,
  type AdminActivityLog,
  type AdminDataset,
  type AdminCategoryApproval,
  type AdminDispute,
  type AdminMarket,
  type AdminMarketRequest,
  type AdminOrder,
  type AdminPayment,
  type AdminProduct,
  type AdminRider,
  type AdminSeller,
  type AdminStatus,
  type AdminSupportConversation,
  type AdminUsedItem,
  type AdminUser,
} from "./adminData";
import {
  adminLogin,
  clearAdminToken,
  createAdminPriceRange,
  deleteAdminRecord,
  deleteAdminPriceRange,
  decideAdminKyc,
  fetchAdminAuditLogs,
  fetchAdminDataset,
  fetchAdminVerificationQueues,
  fetchAdminKyc,
  fetchAdminProfile,
  fetchAdminPriceRanges,
  fetchAdminRiders,
  getAdminToken,
  markAdminSupportConversationRead,
  sendAdminSupportMessage,
  type AdminAuditLog,
  type AdminKycVerification,
  type AdminPriceRange,
  type AdminProfile,
  type AdminVerificationCase,
  type AdminVerificationRequirement,
  type AdminVerificationQueues,
  approveAdminVerificationLevel,
  reviewAdminVerificationRequirement,
  reviewAdminVerificationResubmission,
  unlockAdminRiderCapacity,
  updateAdminPriceRange,
  updateAdminRecordFields,
  updateAdminRecordStatus,
  updateAdminRiderVerification,
  uploadAdminAvatar,
} from "./adminApi";
import LogoutConfirmModal from "../components/LogoutConfirmModal";
import NetworkFailureState from "../components/NetworkFailureState";
import { apiUrl } from "../lib/api";
import "./AdminDashboard.css";

type AdminTab =
  | "overview"
  | "users"
  | "sellers"
  | "marketplace"
  | "orders"
  | "finance"
  | "riders"
  | "disputes"
  | "support"
  | "activityLogs"
  | "settings";

type AdminCollection = keyof Omit<AdminDataset, "overview">;

type TableColumn<T> = {
  label: string;
  render: (item: T) => string | number | JSX.Element | boolean;
};

const tabs: { id: AdminTab; label: string; icon: JSX.Element; description: string }[] = [
  { id: "overview", label: "Overview", icon: <FaChartLine />, description: "Platform summary" },
  { id: "users", label: "Users", icon: <FaUsers />, description: "Buyer accounts" },
  { id: "sellers", label: "Sellers", icon: <FaStore />, description: "Store approvals" },
  { id: "marketplace", label: "Marketplace", icon: <FaShoppingBag />, description: "Markets and listings" },
  { id: "orders", label: "Orders", icon: <FaClipboardList />, description: "Order control" },
  { id: "finance", label: "Finance", icon: <FaMoneyBillWave />, description: "Payments and payouts" },
  { id: "riders", label: "Riders", icon: <FaTruck />, description: "Rider approvals" },
  { id: "disputes", label: "Disputes", icon: <FaExclamationTriangle />, description: "Complaints" },
  { id: "support", label: "Support", icon: <FaCommentDots />, description: "Live support inbox" },
  { id: "activityLogs", label: "Activity Logs", icon: <FaHistory />, description: "Admin actions" },
  { id: "settings", label: "Settings", icon: <FaCog />, description: "Rules and setup" },
];

function slugStatus(status: string) {
  return status.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function nextVerificationStage(row: AdminVerificationCase) {
  return row.stageReadiness?.find(
    (stage) => stage.stage === Math.min(3, row.currentVerifiedLevel + 1),
  );
}

function prettyStatus(status: AdminStatus | string | boolean) {
  if (typeof status === "boolean") return status ? "Yes" : "No";
  return status.replace(/_/g, " ");
}

function formatAdminTime(value: string) {
  if (!value) return "Not available";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function StatusBadge({ status }: { status: AdminStatus | string | boolean }) {
  return <span className={`admin-status admin-status-${slugStatus(String(status))}`}>{prettyStatus(status)}</span>;
}

function RecordThumb({ src, name }: { src?: string; name: string }) {
  const initials = name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="admin-record-name">
      {src ? <img src={apiUrl(src)} alt={name} className="admin-record-thumb" /> : <span className="admin-record-thumb fallback">{initials}</span>}
      <strong>{name}</strong>
    </div>
  );
}

function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      await adminLogin({ email, password });
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="admin-login-page">
      <div className="admin-login-card">
        <div className="admin-login-brand">
          <div className="admin-brand-mark">G</div>
          <div>
            <p>Gleenc Admin</p>
            <h1>Platform Control Center</h1>
          </div>
        </div>
        <p className="admin-login-copy">
          Manage users, sellers, markets, products, orders, payments, payouts, rider approvals, disputes, support and platform activity.
        </p>

        <form onSubmit={handleSubmit} className="admin-login-form">
          <label>
            Admin email
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="admin@gleenc.com" />
          </label>
          <label>
            Password
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="Enter password" />
          </label>
          {error ? <div className="admin-error-text">{error}</div> : null}
          <button type="submit" disabled={loading}>{loading ? "Checking access..." : "Login to Admin"}</button>
        </form>

      </div>
    </section>
  );
}

function StatCard({ label, value, helper, icon }: { label: string; value: string | number; helper: string; icon: JSX.Element }) {
  return (
    <article className="admin-stat-card">
      <div className="admin-stat-icon">{icon}</div>
      <div>
        <p>{label}</p>
        <h3>{value}</h3>
        <span>{helper}</span>
      </div>
    </article>
  );
}

function MiniQueue({ title, value, helper, tone }: { title: string; value: string | number; helper: string; tone: "green" | "orange" | "red" | "blue" }) {
  return (
    <article className={`admin-mini-queue ${tone}`}>
      <strong>{value}</strong>
      <div>
        <h3>{title}</h3>
        <p>{helper}</p>
      </div>
    </article>
  );
}

function ActionButton({
  children,
  tone = "default",
  onClick,
  disabled = false,
}: {
  children: string;
  tone?: "default" | "danger" | "success" | "soft";
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button className={`admin-action-btn ${tone}`} type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

function DataTable<T extends { id: string }>({ title, subtitle, rows, columns, search, actions, onView }: {
  title: string;
  subtitle: string;
  rows: T[];
  columns: TableColumn<T>[];
  search: string;
  actions?: (row: T) => JSX.Element;
  onView?: (row: T) => void;
}) {
  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(keyword));
  }, [rows, search]);

  return (
    <section className="admin-panel-card">
      <div className="admin-panel-head">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <span>{filteredRows.length} records</span>
      </div>

      <div className="admin-record-card-grid">
        {filteredRows.map((row) => (
          <article className="admin-record-card" key={row.id}>
            <button
              type="button"
              className="admin-record-card-main"
              onClick={() => onView?.(row)}
              disabled={!onView}
            >
              {columns.slice(0, 6).map((column, index) => (
                <div
                  className={index === 0 ? "admin-record-field primary" : "admin-record-field"}
                  key={column.label}
                >
                  <span>{column.label}</span>
                  <div>{column.render(row)}</div>
                </div>
              ))}
            </button>

            {onView || actions ? (
              <div className="admin-row-actions">
                {onView ? (
                  <button type="button" className="soft" onClick={() => onView(row)}>
                    <FaEye /> View details
                  </button>
                ) : null}
                {actions ? actions(row) : null}
              </div>
            ) : null}
          </article>
        ))}
      </div>

      {filteredRows.length === 0 ? <div className="admin-empty-state">No records match your current search.</div> : null}
    </section>
  );
}

function isExternalUrl(value: string) {
  return /^https?:\/\//i.test(value) || value.startsWith("/uploads/");
}

function isImageUrl(value: string) {
  return /\.(?:png|jpe?g|webp|gif|avif)(?:\?|#|$)/i.test(value) || /res\.cloudinary\.com\/.+\/image\/upload/i.test(value);
}

function renderFileValue(value: string, label: string) {
  const src = apiUrl(value);

  return (
    <span className="admin-detail-file">
      {isImageUrl(value) ? <img src={src} alt={label} /> : null}
      <a href={src} target="_blank" rel="noreferrer">
        {label}
      </a>
    </span>
  );
}

function renderRecordValue(value: unknown) {
  if (typeof value === "boolean") return prettyStatus(value);

  if (Array.isArray(value)) {
    if (!value.length) return "Not available";

    return (
      <div className="admin-detail-link-list">
        {value.map((item, index) => {
          const text = String(item || "");

          return isExternalUrl(text) ? (
            <span key={`${text}-${index}`}>
              {renderFileValue(text, `Open file ${index + 1}`)}
            </span>
          ) : (
            <span key={`${text}-${index}`}>{text}</span>
          );
        })}
      </div>
    );
  }

  const text = String(value ?? "");

  if (!text) return "Not available";

  if (isExternalUrl(text)) {
    return renderFileValue(text, "Open file");
  }

  return text;
}

function DetailDrawer({ title, item, onClose }: { title: string; item: Record<string, unknown> | null; onClose: () => void }) {
  if (!item) return null;

  return (
    <div className="admin-drawer-backdrop" onClick={onClose}>
      <aside className="admin-detail-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="admin-drawer-head">
          <div>
            <p>Record details</p>
            <h2>{title}</h2>
          </div>
          <button type="button" onClick={onClose}><FaTimes /></button>
        </div>

        <div className="admin-detail-grid">
          {Object.entries(item).map(([key, value]) => (
            <div key={key}>
              <span>{key.replace(/([A-Z])/g, " $1")}</span>
              <div className="admin-detail-value">{renderRecordValue(value)}</div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

function AdminSupportInbox({
  conversations,
  draftById,
  replyingConversationId,
  onDraftChange,
  onReply,
  onMarkRead,
}: {
  conversations: AdminSupportConversation[];
  draftById: Record<string, string>;
  replyingConversationId: string;
  onDraftChange: (conversationId: string, value: string) => void;
  onReply: (conversation: AdminSupportConversation) => void;
  onMarkRead: (conversation: AdminSupportConversation) => void;
}) {
  const [activeConversationId, setActiveConversationId] = useState(
    conversations[0]?.id || "",
  );
  const [mobileConversationOpen, setMobileConversationOpen] = useState(false);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const activeConversation =
    conversations.find((conversation) => conversation.id === activeConversationId) ||
    conversations[0] ||
    null;

  useEffect(() => {
    if (
      activeConversationId &&
      conversations.some((conversation) => conversation.id === activeConversationId)
    ) {
      return;
    }
    setActiveConversationId(conversations[0]?.id || "");
  }, [activeConversationId, conversations]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [activeConversation?.id, activeConversation?.messages.length]);

  return (
    <section className="admin-panel-card admin-support-panel">
      <div className="admin-panel-head">
        <div>
          <h2>Support Inbox</h2>
          <p>Reply to users and sellers who open admin chat from the More page.</p>
        </div>
        <span>{conversations.length} conversations</span>
      </div>

      <div className={`admin-support-workspace ${mobileConversationOpen ? "chat-open" : ""}`}>
        <aside className="admin-support-conversations" aria-label="Support conversations">
          {conversations.map((conversation) => (
            <button
              type="button"
              key={conversation.id}
              className={`admin-support-conversation ${
                conversation.id === activeConversation?.id ? "active" : ""
              }`}
              onClick={() => {
                setActiveConversationId(conversation.id);
                setMobileConversationOpen(true);
                if (conversation.unreadCount > 0) onMarkRead(conversation);
              }}
            >
              <span className="admin-support-avatar">
                {conversation.avatarUrl ? (
                  <img src={apiUrl(conversation.avatarUrl)} alt="" />
                ) : (
                  conversation.userName.slice(0, 1).toUpperCase()
                )}
              </span>
              <span className="admin-support-conversation-copy">
                <span>
                  <strong>{conversation.userName}</strong>
                  <time>{formatAdminTime(conversation.lastMessageAt)}</time>
                </span>
                <small>{conversation.userRole} • {conversation.campus || "Location not set"}</small>
                <p>{conversation.lastMessage || "Open this conversation"}</p>
              </span>
              {conversation.unreadCount > 0 ? (
                <em>{conversation.unreadCount}</em>
              ) : null}
            </button>
          ))}

          {conversations.length === 0 ? (
            <div className="admin-empty-state">
              No support conversation matches your current search.
            </div>
          ) : null}
        </aside>

        {activeConversation ? (
          <article className="admin-support-chat">
            <header className="admin-support-chat-head">
              <button
                type="button"
                className="admin-support-chat-back"
                aria-label="Back to support conversations"
                onClick={() => setMobileConversationOpen(false)}
              >
                <FaUndo />
              </button>
              <span className="admin-support-avatar">
                {activeConversation.avatarUrl ? (
                  <img src={apiUrl(activeConversation.avatarUrl)} alt="" />
                ) : (
                  activeConversation.userName.slice(0, 1).toUpperCase()
                )}
              </span>
              <div>
                <h3>{activeConversation.userName}</h3>
                <p>{activeConversation.userEmail} • {activeConversation.userRole}</p>
              </div>
              <div className="admin-support-meta">
                <StatusBadge status={activeConversation.status} />
                <button
                  type="button"
                  className="admin-support-read-btn"
                  onClick={() => onMarkRead(activeConversation)}
                >
                  Mark read
                </button>
              </div>
            </header>

            <div className="admin-support-thread">
              {activeConversation.messages.length > 0 ? (
                activeConversation.messages.map((message) => (
                  <div
                    key={message.id}
                    className={
                      message.isAdmin
                        ? "admin-support-message admin"
                        : "admin-support-message"
                    }
                  >
                    <strong>{message.senderName}</strong>
                    <p>{message.body}</p>
                    <time>{formatAdminTime(message.createdAt)}</time>
                  </div>
                ))
              ) : (
                <div className="admin-support-empty">
                  No messages in this support thread yet.
                </div>
              )}
              <div ref={threadEndRef} />
            </div>

            <form
              className="admin-support-reply"
              onSubmit={(event) => {
                event.preventDefault();
                onReply(activeConversation);
              }}
            >
              <textarea
                value={draftById[activeConversation.id] || ""}
                onChange={(event) =>
                  onDraftChange(activeConversation.id, event.target.value)
                }
                placeholder={`Message ${activeConversation.userName}...`}
                rows={1}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    if ((draftById[activeConversation.id] || "").trim()) {
                      onReply(activeConversation);
                    }
                  }
                }}
              />
              <button
                type="submit"
                className="admin-support-send-btn"
                aria-label="Send reply"
                disabled={
                  replyingConversationId === activeConversation.id ||
                  !(draftById[activeConversation.id] || "").trim()
                }
              >
                <FaPaperPlane />
              </button>
            </form>
          </article>
        ) : (
          <div className="admin-support-empty-chat">
            <FaCommentDots />
            <h3>Select a support conversation</h3>
            <p>Choose a user on the left to read and reply to their messages.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function AdminDashboard() {
  const [isLoggedIn, setIsLoggedIn] = useState(Boolean(getAdminToken()));
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [search, setSearch] = useState("");
  const [riderFilter, setRiderFilter] = useState("all");
  const [disputeFilter, setDisputeFilter] = useState<"all" | "buyer" | "seller" | "rider">("all");
  const [data, setData] = useState<AdminDataset>(emptyAdminDataset);
  const [riders, setRiders] = useState<AdminRider[]>([]);
  const [kycRows, setKycRows] = useState<AdminKycVerification[]>([]);
  const [priceRanges, setPriceRanges] = useState<AdminPriceRange[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [verificationQueues, setVerificationQueues] = useState<AdminVerificationQueues>({ cases: [], queues: {} });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [supportDrafts, setSupportDrafts] = useState<Record<string, string>>({});
  const [replyingConversationId, setReplyingConversationId] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<{ title: string; item: Record<string, unknown> } | null>(null);
  const [adminProfile, setAdminProfile] = useState<AdminProfile>({
    name: "Gleenc Admin",
    email: "",
    role: "admin",
    avatarUrl: null,
  });
  const [isUploadingAdminAvatar, setIsUploadingAdminAvatar] = useState(false);
  const adminAvatarInputRef = useRef<HTMLInputElement | null>(null);

  const showAdminConnectionNotice = useCallback(() => {
    setLoadError("Admin data could not refresh. Please check your connection and try again.");
  }, []);

  const refreshRiderRows = useCallback(async () => {
    const riderRows = await fetchAdminRiders();
    setRiders(riderRows);
  }, []);

  const loadAdminData = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setLoadError("");

    try {
      const nextData = await fetchAdminDataset();
      setData({ ...emptyAdminDataset, ...nextData });

      const [profileResult, riderRowsResult, kycResult, priceRangeResult, auditLogResult, verificationQueueResult] =
        await Promise.allSettled([
          fetchAdminProfile(),
          fetchAdminRiders(),
          fetchAdminKyc(),
          fetchAdminPriceRanges(),
          fetchAdminAuditLogs(),
          fetchAdminVerificationQueues(),
        ]);

      if (profileResult.status === "fulfilled") {
        setAdminProfile(profileResult.value.admin);
      }

      if (riderRowsResult.status === "fulfilled") {
        setRiders(riderRowsResult.value);
      }

      if (kycResult.status === "fulfilled") {
        setKycRows(kycResult.value.verifications);
      }

      if (priceRangeResult.status === "fulfilled") {
        setPriceRanges(priceRangeResult.value.priceRanges);
      }

      if (auditLogResult.status === "fulfilled") {
        setAuditLogs(auditLogResult.value.logs);
      }

      if (verificationQueueResult.status === "fulfilled") {
        setVerificationQueues(verificationQueueResult.value);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      showAdminConnectionNotice();

      if (/invalid|unauthorized|forbidden|token|login/i.test(message)) {
        clearAdminToken();
        setIsLoggedIn(false);
      }
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [showAdminConnectionNotice]);

  useEffect(() => {
    if (!isLoggedIn) return;
    void loadAdminData();

    const refreshTimer = window.setInterval(() => {
      void loadAdminData(false);
    }, 10000);

    return () => {
      window.clearInterval(refreshTimer);
    };
  }, [isLoggedIn, loadAdminData]);

  const currentTab = tabs.find((tab) => tab.id === activeTab) || tabs[0];
  const payoutRows = data.payments.filter((payment) => payment.payoutStatus !== "released");
  const verificationCaseRows = useMemo(
    () => verificationQueues.cases.slice(0, 8),
    [verificationQueues.cases],
  );
  const verificationQueueCounts = useMemo(
    () => Object.fromEntries(
      Object.entries(verificationQueues.queues || {}).map(([key, value]) => [key, value.length]),
    ) as Record<string, number>,
    [verificationQueues.queues],
  );
  const riderRows = useMemo(() => {
    if (riderFilter === "online") return riders.filter((rider) => rider.availability === "online");
    if (riderFilter === "offline") return riders.filter((rider) => rider.availability === "offline");
    if (riderFilter === "busy") return riders.filter((rider) => rider.availability === "busy");
    if (riderFilter === "pending") return riders.filter((rider) => rider.verificationStatus !== "verified");
    if (riderFilter === "suspended") {
      return riders.filter((rider) => rider.verificationStatus === "suspended" || rider.safetyStatus === "suspended");
    }
    if (riderFilter !== "all") {
      return riders.filter((rider) => rider.coverageArea.toLowerCase().includes(riderFilter.toLowerCase()));
    }

    return riders;
  }, [riderFilter, riders]);
  const riderLocations = useMemo(
    () => Array.from(new Set(riders.filter((rider) => rider.coverageArea).map((rider) => rider.coverageArea))).slice(0, 12),
    [riders],
  );
  const disputeRows = useMemo(() => {
    if (disputeFilter === "rider") return data.disputes.filter((dispute) => dispute.type === "rider");
    if (disputeFilter === "buyer") return data.disputes.filter((dispute) => dispute.buyer && dispute.type !== "rider");
    if (disputeFilter === "seller") return data.disputes.filter((dispute) => dispute.seller && dispute.type !== "rider");
    return data.disputes;
  }, [data.disputes, disputeFilter]);
  const supportRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return data.supportConversations;

    return data.supportConversations.filter((conversation) =>
      JSON.stringify(conversation).toLowerCase().includes(keyword),
    );
  }, [data.supportConversations, search]);

  function logout() {
    clearAdminToken();
    setLogoutModalOpen(false);
    setIsLoggedIn(false);
  }

  function openRecord(title: string, item: Record<string, unknown>) {
    setSelectedRecord({ title, item });
  }

  async function changeStatus(collection: AdminCollection, id: string, status: AdminStatus, field = "status") {
    setLoadError("");
    try {
      const response = await updateAdminRecordStatus(collection, id, status, field);
      setData({ ...emptyAdminDataset, ...response.data });
      await loadAdminData(false);
    } catch {
      showAdminConnectionNotice();
    }
  }


  async function changeFields(collection: AdminCollection, id: string, fields: Record<string, unknown>) {
    setLoadError("");
    try {
      const response = await updateAdminRecordFields(collection, id, fields);
      setData({ ...emptyAdminDataset, ...response.data });
      await loadAdminData(false);
    } catch {
      showAdminConnectionNotice();
    }
  }

  async function changeRiderVerification(
    rider: AdminRider,
    verificationStatus: "draft" | "pending_review" | "verified" | "rejected" | "suspended",
    verificationNote: string,
    safetyStatus: "normal" | "flagged" | "suspended" = "normal",
  ) {
    setLoadError("");
    try {
      await updateAdminRiderVerification(rider.userId, {
        verificationStatus,
        verificationNote,
        safetyStatus,
        verificationLevel: rider.verificationLevel || 1,
        maxPackageValueKobo: Math.max(0, Math.round((rider.maxPackageValue || 0) * 100)),
      });
      await refreshRiderRows();
      await loadAdminData(false);
    } catch {
      showAdminConnectionNotice();
    }
  }

  async function unlockRiderCapacity(rider: AdminRider) {
    setLoadError("");
    try {
      await unlockAdminRiderCapacity(rider.userId, {
        minutes: 120,
        note: "Admin unlocked rider delivery capacity for profile correction after support review.",
      });
      await refreshRiderRows();
      await loadAdminData(false);
    } catch {
      showAdminConnectionNotice();
    }
  }

  async function refreshVerificationQueues() {
    const queues = await fetchAdminVerificationQueues();
    setVerificationQueues(queues);
  }

  async function reviewVerificationRequirement(
    requirementId: string,
    action: "approve" | "needs_information" | "reject" | "mark_under_review",
    defaultFeedback: string,
  ) {
    const feedback =
      action === "approve" || action === "mark_under_review"
        ? defaultFeedback
        : window.prompt("Enter feedback for this verification decision:", defaultFeedback) || "";

    if ((action === "needs_information" || action === "reject") && feedback.trim().length < 8) return;

    setLoadError("");
    try {
      await reviewAdminVerificationRequirement(requirementId, { action, feedback });
      await refreshVerificationQueues();
      await loadAdminData(false);
    } catch {
      showAdminConnectionNotice();
    }
  }

  async function approveVerificationLevel(row: AdminVerificationCase) {
    const stage = nextVerificationStage(row);
    if (!stage?.approvalReady) return;

    setLoadError("");
    try {
      await approveAdminVerificationLevel(
        row.id,
        stage.stage,
        `Admin approved ${row.role} verification Stage ${stage.stage}.`,
      );
      await refreshVerificationQueues();
      await loadAdminData(false);
    } catch {
      showAdminConnectionNotice();
    }
  }

  async function decideVerificationResubmission(
    requirement: AdminVerificationRequirement,
    action: "approve" | "reject",
  ) {
    const requestRow = requirement.resubmissionRequest;
    if (!requestRow || requestRow.status !== "pending") return;

    const defaultFeedback =
      action === "approve"
        ? "Admin approved this request. The form is open for a corrected submission."
        : "The approved information remains locked because this change was not approved.";
    const feedback = window.prompt(
      action === "approve"
        ? `Review the reason and explain that the ${requirement.title} form will reopen:`
        : `Explain why the ${requirement.title} form should remain locked:`,
      defaultFeedback,
    );
    if (feedback === null || feedback.trim().length < 8) return;

    setLoadError("");
    try {
      await reviewAdminVerificationResubmission(requestRow.id, {
        action,
        feedback: feedback.trim(),
      });
      await refreshVerificationQueues();
      await loadAdminData(false);
    } catch {
      showAdminConnectionNotice();
    }
  }

  async function decideKycReview(row: AdminKycVerification, action: "approve" | "reject" | "request-resubmission") {
    const reason =
      action === "approve"
        ? ""
        : window.prompt(
            action === "reject"
              ? "Enter rejection reason:"
              : "Tell the seller/rider what they need to resubmit:",
            row.failureReason || "",
          );

    if (reason === null) return;

    setLoadError("");
    try {
      await decideAdminKyc(row.id, action, { reason: reason || undefined });
      await loadAdminData(false);
    } catch {
      showAdminConnectionNotice();
    }
  }

  async function createPriceRangeFromPrompt() {
    const category = window.prompt("Category name for this price range:");
    if (!category) return;
    const minPrice = Number(window.prompt("Minimum price in naira:", "0") || 0);
    const maxPrice = Number(window.prompt("Maximum price in naira:", "0") || 0);
    const actionInput = window.prompt("Action when price is outside range: allow, warn, review, or block", "review") || "review";
    const action = ["allow", "warn", "review", "block"].includes(actionInput) ? actionInput as AdminPriceRange["action"] : "review";

    setLoadError("");
    try {
      await createAdminPriceRange({ category, minPrice, maxPrice, action, isActive: true });
      await loadAdminData(false);
    } catch {
      showAdminConnectionNotice();
    }
  }

  async function togglePriceRange(range: AdminPriceRange) {
    setLoadError("");
    try {
      await updateAdminPriceRange(range.id, { isActive: !range.isActive });
      await loadAdminData(false);
    } catch {
      showAdminConnectionNotice();
    }
  }

  async function removePriceRange(range: AdminPriceRange) {
    const confirmed = window.confirm(`Delete the ${range.category} price range?`);
    if (!confirmed) return;

    setLoadError("");
    try {
      await deleteAdminPriceRange(range.id);
      await loadAdminData(false);
    } catch {
      showAdminConnectionNotice();
    }
  }

  function updateSupportDraft(conversationId: string, value: string) {
    setSupportDrafts((current) => ({
      ...current,
      [conversationId]: value,
    }));
  }

  async function replyToSupportConversation(conversation: AdminSupportConversation) {
    const body = (supportDrafts[conversation.id] || "").trim();
    if (!body || replyingConversationId) return;

    setReplyingConversationId(conversation.id);
    setLoadError("");

    try {
      const response = await sendAdminSupportMessage(conversation.id, body);
      setData(response.data);
      setSupportDrafts((current) => {
        const next = { ...current };
        delete next[conversation.id];
        return next;
      });
    } catch (error) {
      showAdminConnectionNotice();
    } finally {
      setReplyingConversationId("");
    }
  }

  async function markSupportRead(conversation: AdminSupportConversation) {
    setLoadError("");

    try {
      const response = await markAdminSupportConversationRead(conversation.id);
      setData(response.data);
    } catch (error) {
      showAdminConnectionNotice();
    }
  }

  async function removeRecord(collection: AdminCollection, id: string, label: string) {
    const confirmed = window.confirm(`Apply the admin remove/disable action for ${label}? This updates the live platform record.`);
    if (!confirmed) return;

    setLoadError("");
    try {
      const response = await deleteAdminRecord(collection, id);
      setData({ ...emptyAdminDataset, ...response.data });
      await loadAdminData(false);
    } catch {
      showAdminConnectionNotice();
    }
  }

  async function rejectUsedItem(item: AdminUsedItem) {
    const reason = window.prompt("Enter rejection reason for this used-market listing:", item.rejectionReason || "Listing needs clearer images or safer item details.");
    if (reason === null) return;

    await changeFields("usedItems", item.id, {
      status: "rejected",
      safetyStatus: "unsafe",
      rejectionReason: reason.trim() || "Rejected by admin review.",
    });
  }

  async function markProductInStock(product: AdminProduct) {
    const stockValue = product.stock > 0 ? product.stock : 1;
    await changeFields("products", product.id, {
      stock: stockValue,
      stockStatus: "in_stock",
      status: product.status === "out_of_stock" ? "approved" : product.status,
    });
  }

  async function markProductOutOfStock(product: AdminProduct) {
    await changeFields("products", product.id, {
      stock: 0,
      stockStatus: "out_of_stock",
      status: "out_of_stock",
    });
  }

  async function refreshLiveData() {
    await loadAdminData();
  }

  async function handleAdminAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";

    if (!file || isUploadingAdminAvatar) return;

    setIsUploadingAdminAvatar(true);
    setLoadError("");

    try {
      const response = await uploadAdminAvatar(file);
      setAdminProfile(response.admin);
    } catch (error) {
      showAdminConnectionNotice();
    } finally {
      setIsUploadingAdminAvatar(false);
    }
  }

  function selectTab(tab: AdminTab) {
    setActiveTab(tab);
    setSearch("");
    setSidebarOpen(false);
  }

  if (!isLoggedIn) {
    return <AdminLogin onLogin={() => setIsLoggedIn(true)} />;
  }

  return (
    <section className="admin-shell">
      <button className="admin-mobile-toggle" type="button" onClick={() => setSidebarOpen(true)}>
        <FaBars /> Menu
      </button>

      {sidebarOpen ? <button className="admin-sidebar-overlay" type="button" aria-label="Close admin menu" onClick={() => setSidebarOpen(false)} /> : null}

      <aside className={`admin-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="admin-sidebar-head">
          <div className="admin-logo-row">
            <div className="admin-brand-mark">G</div>
            <div>
              <strong>Gleenc</strong>
              <span>Admin Console</span>
            </div>
          </div>
          <button className="admin-close-sidebar" type="button" onClick={() => setSidebarOpen(false)}><FaTimes /></button>
        </div>

        <nav className="admin-side-nav">
          {tabs.map((tab) => (
            <button key={tab.id} className={activeTab === tab.id ? "active" : ""} onClick={() => selectTab(tab.id)} type="button">
              {tab.icon}
              <span>{tab.label}</span>
              <small>{tab.description}</small>
            </button>
          ))}
        </nav>

        <button className="admin-logout" onClick={() => setLogoutModalOpen(true)} type="button">
          <FaSignOutAlt /> Logout
        </button>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div>
            <p>Gleenc Admin</p>
            <h1>{currentTab.label}</h1>
          </div>
          <div className="admin-topbar-actions">
            <div className="admin-search-box">
              <FaSearch />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users, sellers, orders..." />
            </div>
            <button className="admin-notification" type="button" title="Notifications">
              <FaBell />
              <span>{data.overview.openDisputes + data.overview.unreadSupport}</span>
            </button>
            <input
              ref={adminAvatarInputRef}
              className="admin-profile-input"
              type="file"
              accept="image/*"
              onChange={handleAdminAvatarChange}
            />
            <button
              className="admin-profile-pill"
              type="button"
              onClick={() => adminAvatarInputRef.current?.click()}
              disabled={isUploadingAdminAvatar}
              title="Upload admin profile image"
            >
              {adminProfile.avatarUrl ? (
                <img src={apiUrl(adminProfile.avatarUrl)} alt={adminProfile.name || "Admin"} />
              ) : (
                <FaUserShield />
              )}
              <span>{isUploadingAdminAvatar ? "Uploading..." : adminProfile.name || "Admin"}</span>
            </button>
          </div>
        </header>

        <section className="admin-content">
          {loading ? <div className="admin-loading-card">Loading admin data...</div> : null}
          {loadError ? (
            <NetworkFailureState
              variant="inline"
              title="Connection interrupted"
              message={loadError}
              onRetry={() => void refreshLiveData()}
            />
          ) : null}

          {activeTab === "overview" ? (
            <>
              <section className="admin-hero-card">
                <div>
                  <span className="admin-pill"><FaShieldAlt /> Platform safety center</span>
                  <h2>Manage the Gleenc marketplace from a focused production console.</h2>
                  <p>
                    Review accounts, seller approvals, listings, orders, payments, payouts, rider access, disputes and support activity from live platform data.
                  </p>
                </div>
                <div className="admin-hero-metric">
                  <FaCheckCircle />
                  <strong>{data.overview.openDisputes}</strong>
                  <span>open disputes</span>
                </div>
              </section>

              <section className="admin-stats-grid">
                <StatCard label="Total Users" value={data.overview.totalUsers} helper="registered accounts" icon={<FaUsers />} />
                <StatCard label="Total Sellers" value={data.overview.totalSellers} helper="campus stores onboarded" icon={<FaStore />} />
                <StatCard label="Pending Sellers" value={data.overview.pendingSellerVerifications} helper="verification reviews" icon={<FaShieldAlt />} />
                <StatCard label="Market Requests" value={data.overview.pendingMarketRequests || 0} helper="seller requested markets" icon={<FaStore />} />
                <StatCard label="Category Reviews" value={data.overview.pendingCategoryApprovals || 0} helper="seller category approvals" icon={<FaClipboardList />} />
                <StatCard label="Active Products" value={data.overview.activeProducts} helper="approved listings" icon={<FaBoxOpen />} />
                <StatCard label="Pending Products" value={data.overview.pendingProducts} helper="seller uploads awaiting review" icon={<FaClipboardList />} />
                <StatCard label="Used Items" value={data.overview.pendingUsedItems} helper="used-market approvals" icon={<FaShoppingBag />} />
                <StatCard label="Orders" value={data.overview.totalOrders} helper="all platform orders" icon={<FaClipboardList />} />
                <StatCard label="Deliveries" value={data.overview.pendingDeliveries} helper="not yet verified" icon={<FaTruck />} />
                <StatCard label="Revenue" value={data.overview.totalRevenue} helper="tracked transaction volume" icon={<FaCreditCard />} />
                <StatCard label="Payouts" value={data.overview.pendingPayouts} helper="seller funds needing action" icon={<FaMoneyBillWave />} />
                <StatCard label="Disputes" value={data.overview.openDisputes} helper="open or reviewing" icon={<FaExclamationTriangle />} />
                <StatCard label="Support" value={data.overview.unreadSupport} helper="unread admin chats" icon={<FaCommentDots />} />
              </section>

              <section className="admin-overview-grid">
                <div className="admin-panel-card">
                  <div className="admin-panel-head">
                    <div>
                      <h2>Attention Queue</h2>
                      <p>Important platform records that need admin decisions.</p>
                    </div>
                  </div>
                  <div className="admin-mini-grid">
                    <MiniQueue title="Seller verification" value={data.sellers.filter((seller) => seller.verificationStatus === "pending").length} helper="Approve or reject store onboarding" tone="orange" />
                    <MiniQueue title="Requirement reviews" value={(verificationQueueCounts.newSubmissions || 0) + (verificationQueueCounts.resubmitted || 0)} helper="New/resubmitted seller and rider requirements" tone="orange" />
                    <MiniQueue title="Needs correction" value={verificationQueueCounts.needsInformation || 0} helper="Requirement-specific correction requests" tone="red" />
                    <MiniQueue title="Upgrade requests" value={verificationQueueCounts.upgradeRequests || 0} helper="Higher verification levels" tone="blue" />
                    <MiniQueue title="Market requests" value={data.marketRequests.filter((item) => item.status === "pending" || item.status === "needs_more_info").length} helper="Approve missing local markets" tone="orange" />
                    <MiniQueue title="Category approvals" value={data.categoryApprovals.filter((item) => item.status === "pending" || item.status === "needs_more_info").length} helper="Control local/nearby seller categories" tone="blue" />
                    <MiniQueue title="Used market approvals" value={data.usedItems.filter((item) => item.status === "pending").length} helper="Review campus used-item uploads" tone="blue" />
                    <MiniQueue title="Open disputes" value={data.disputes.filter((item) => item.status === "open" || item.status === "reviewing").length} helper="Buyer/seller complaints" tone="red" />
                    <MiniQueue title="Support chat" value={data.overview.unreadSupport} helper="Unread admin chat messages" tone="blue" />
                    <MiniQueue title="Payout release" value={payoutRows.length} helper="Seller payment actions" tone="green" />
                  </div>
                </div>

                <div className="admin-panel-card">
                  <div className="admin-panel-head">
                    <div>
                      <h2>Integration Flow</h2>
                      <p>How the admin connects with user and seller dashboards.</p>
                    </div>
                  </div>
                  <div className="admin-flow-list">
                    <div><strong>User upload</strong><span>Used item appears from the live Used Market table.</span></div>
                    <div><strong>Seller upload</strong><span>Product/service appears from seller dashboard records.</span></div>
                    <div><strong>Order paid</strong><span>Admin monitors live payment, delivery and payout states.</span></div>
                    <div><strong>Complaint sent</strong><span>Reports/disputes propagate into the admin queue.</span></div>
                  </div>
                </div>
              </section>
            </>
          ) : null}

          {activeTab === "users" ? (
            <DataTable<AdminUser>
              title="User Management"
              subtitle="Manage buyer accounts, profile readiness, saved items, used-market access and account status."
              rows={data.users}
              search={search}
              onView={(user) => openRecord(user.name, user)}
              columns={[
                { label: "Name", render: (user) => user.name },
                { label: "Email", render: (user) => user.email },
                { label: "Phone", render: (user) => user.phone },
                { label: "Campus", render: (user) => user.campus },
                { label: "Orders", render: (user) => user.orders },
                { label: "Saved", render: (user) => user.savedItems },
                { label: "Used uploads", render: (user) => user.usedUploads },
                { label: "Profile", render: (user) => <StatusBadge status={user.profileComplete ? "completed" : "pending"} /> },
                { label: "Status", render: (user) => <StatusBadge status={user.status} /> },
                { label: "Joined", render: (user) => user.joined },
              ]}
              actions={(user) => (
                <>
                  <ActionButton tone="soft" onClick={() => openRecord(`${user.name} orders`, { user: user.name, orderCount: user.orders, note: "Order history for this user." })}>Orders</ActionButton>
                  <ActionButton tone="soft" onClick={() => openRecord(`${user.name} complaints`, { user: user.name, note: "This links to all disputes/complaints submitted by this user." })}>Complaints</ActionButton>
                  <ActionButton tone="soft" onClick={() => openRecord(`${user.name} used uploads`, { user: user.name, usedUploads: user.usedUploads, note: "This links to used-market submissions from the user dashboard." })}>Used Items</ActionButton>
                  <ActionButton tone="success" onClick={() => changeStatus("users", user.id, "active")}>Activate</ActionButton>
                  <ActionButton tone="danger" onClick={() => changeStatus("users", user.id, "suspended")}>Suspend</ActionButton>
                  <ActionButton tone="soft" onClick={() => changeStatus("users", user.id, "disabled")}>Disable</ActionButton>
                  <ActionButton tone="danger" onClick={() => removeRecord("users", user.id, user.name)}>Delete</ActionButton>
                </>
              )}
            />
          ) : null}

          {activeTab === "sellers" ? (
            <DataTable<AdminSeller>
              title="Seller Management"
              subtitle="Approve seller verification, suspend unsafe stores and monitor payout readiness."
              rows={data.sellers}
              search={search}
              onView={(seller) => openRecord(seller.storeName, seller)}
              columns={[
                { label: "Store", render: (seller) => seller.storeName },
                { label: "Owner", render: (seller) => seller.ownerName },
                { label: "Phone", render: (seller) => seller.phone },
                { label: "Campus", render: (seller) => seller.campus },
                { label: "Products", render: (seller) => seller.products },
                { label: "Orders", render: (seller) => seller.orders },
                { label: "Earnings", render: (seller) => seller.earnings },
                  { label: "Verification", render: (seller) => <StatusBadge status={seller.verificationStatus} /> },
                  { label: "Completion", render: (seller) => `${seller.profileCompletionPercent ?? (seller.verificationStatus === "approved" || seller.verificationStatus === "verified" ? 100 : 60)}%` },
                { label: "Status", render: (seller) => <StatusBadge status={seller.status} /> },
                { label: "Payout", render: (seller) => <StatusBadge status={seller.payoutStatus} /> },
                { label: "Joined", render: (seller) => seller.joined },
              ]}
              actions={(seller) => (
                <>
                  <ActionButton tone="soft" onClick={() => openRecord(`${seller.storeName} store`, { storeName: seller.storeName, owner: seller.ownerName, category: seller.category, rating: seller.rating, note: "Public seller profile and store details." })}>Store</ActionButton>
                  <ActionButton tone="soft" onClick={() => openRecord(`${seller.storeName} products`, { storeName: seller.storeName, products: seller.products, note: "This links to all products/services uploaded by this seller." })}>Products</ActionButton>
                  <ActionButton tone="soft" onClick={() => openRecord(`${seller.storeName} orders`, { storeName: seller.storeName, orders: seller.orders, note: "This links to seller order history." })}>Orders</ActionButton>
                  <ActionButton tone="soft" onClick={() => openRecord(`${seller.storeName} payout`, { storeName: seller.storeName, payoutStatus: seller.payoutStatus, bankStatus: seller.bankStatus, earnings: seller.earnings })}>Payout</ActionButton>
                  <ActionButton
                    tone="success"
                    disabled={seller.verificationStatus === "approved" || seller.verificationStatus === "verified"}
                    onClick={() => changeFields("sellers", seller.id, { verificationStatus: "approved", status: "active" })}
                  >
                    {seller.verificationStatus === "approved" || seller.verificationStatus === "verified" ? "Verified" : "Approve"}
                  </ActionButton>
                  <ActionButton tone="danger" onClick={() => changeStatus("sellers", seller.id, "rejected", "verificationStatus")}>Reject</ActionButton>
                  <ActionButton tone="soft" onClick={() => changeStatus("sellers", seller.id, "active")}>Activate</ActionButton>
                  <ActionButton tone="danger" onClick={() => changeStatus("sellers", seller.id, "suspended")}>Suspend</ActionButton>
                  <ActionButton tone="danger" onClick={() => removeRecord("sellers", seller.id, seller.storeName)}>Delete</ActionButton>
                </>
              )}
            />
          ) : null}

          {activeTab === "marketplace" ? (
            <div className="admin-stage3-grid">
              <DataTable<AdminMarket>
                title="Local Market Management"
                subtitle="Create, activate, disable and inspect approved Local Markets that buyers can browse publicly."
                rows={data.markets}
                search={search}
                onView={(market) => openRecord(market.name, market as unknown as Record<string, unknown>)}
                columns={[
                  { label: "Market", render: (market) => market.name },
                  { label: "Location", render: (market) => [market.area, market.city, market.state].filter(Boolean).join(", ") || "Not set" },
                  { label: "Sellers", render: (market) => market.counts?.sellers || 0 },
                  { label: "Products", render: (market) => market.counts?.products || 0 },
                  { label: "Categories", render: (market) => market.allowedCategories?.slice(0, 3).join(", ") || "Default" },
                  { label: "Status", render: (market) => <StatusBadge status={market.status} /> },
                  { label: "Updated", render: (market) => formatAdminTime(market.updatedAt) },
                ]}
                actions={(market) => (
                  <>
                    <ActionButton tone="success" onClick={() => changeStatus("markets", market.id, "active")}>Activate</ActionButton>
                    <ActionButton tone="soft" onClick={() => changeStatus("markets", market.id, "disabled")}>Disable</ActionButton>
                    <ActionButton tone="soft" onClick={() => openRecord(`${market.name} categories`, { allowedCategories: market.allowedCategories, deliveryNote: market.deliveryNote })}>Categories</ActionButton>
                  </>
                )}
              />

              <DataTable<AdminMarketRequest>
                title="Pending Market Requests"
                subtitle="Seller-submitted markets do not become public until admin approves, merges, rejects, or asks for more information."
                rows={data.marketRequests}
                search={search}
                onView={(request) => openRecord(request.marketName, request as unknown as Record<string, unknown>)}
                columns={[
                  { label: "Market", render: (request) => request.marketName },
                  { label: "Seller", render: (request) => request.sellerName || request.storeName || "Seller" },
                  { label: "Location", render: (request) => [request.area, request.city, request.state].filter(Boolean).join(", ") || request.address },
                  { label: "Sells", render: (request) => request.whatSells || "Not set" },
                  { label: "Shop details", render: (request) => request.shopDetails || "Not set" },
                  { label: "Status", render: (request) => <StatusBadge status={request.status} /> },
                  { label: "Updated", render: (request) => formatAdminTime(request.updatedAt) },
                ]}
                actions={(request) => (
                  <>
                    <ActionButton tone="success" onClick={() => changeFields("marketRequests", request.id, { status: "approved", adminNote: "Market approved by admin." })}>Approve</ActionButton>
                    <ActionButton tone="soft" onClick={() => changeFields("marketRequests", request.id, { status: "needs_more_info", adminNote: "Admin needs more details before approval." })}>More Info</ActionButton>
                    <ActionButton tone="danger" onClick={() => changeFields("marketRequests", request.id, { status: "rejected", adminNote: "Market request rejected by admin." })}>Reject</ActionButton>
                  </>
                )}
              />

              <DataTable<AdminCategoryApproval>
                title="Seller Category Approvals"
                subtitle="Local Market and Nearby sellers can only upload in approved categories. Campus sellers remain broadly open except dangerous/prohibited categories."
                rows={data.categoryApprovals}
                search={search}
                onView={(approval) => openRecord(`${approval.storeName} · ${approval.categoryName}`, approval as unknown as Record<string, unknown>)}
                columns={[
                  { label: "Store", render: (approval) => approval.storeName },
                  { label: "Seller", render: (approval) => approval.sellerName },
                  { label: "Market", render: (approval) => approval.marketName || "Nearby / platform" },
                  { label: "Category", render: (approval) => approval.categoryName },
                  { label: "Status", render: (approval) => <StatusBadge status={approval.status} /> },
                  { label: "Note", render: (approval) => approval.adminNote || "—" },
                  { label: "Updated", render: (approval) => formatAdminTime(approval.updatedAt) },
                ]}
                actions={(approval) => (
                  <>
                    <ActionButton tone="success" onClick={() => changeFields("categoryApprovals", approval.id, { status: "approved", adminNote: "Category approved by admin." })}>Approve</ActionButton>
                    <ActionButton tone="soft" onClick={() => changeFields("categoryApprovals", approval.id, { status: "needs_more_info", adminNote: "Admin needs more category details." })}>More Info</ActionButton>
                    <ActionButton tone="danger" onClick={() => changeFields("categoryApprovals", approval.id, { status: "rejected", adminNote: "Category rejected by admin." })}>Reject</ActionButton>
                    <ActionButton tone="danger" onClick={() => changeFields("categoryApprovals", approval.id, { status: "suspended", adminNote: "Category suspended by admin." })}>Suspend</ActionButton>
                  </>
                )}
              />
            </div>
          ) : null}

          {activeTab === "marketplace" ? (
            <DataTable<AdminProduct>
              title="Product Moderation Queue"
              subtitle="Only large-value, restricted, illegal, or contact/link-flagged listings require admin approval. Ordinary listings publish automatically."
              rows={data.products.filter((product) =>
                ["pending_review", "flagged", "rejected"].includes(
                  product.moderationStatus,
                ),
              )}
              search={search}
              onView={(product) => openRecord(product.name, product)}
              columns={[
                { label: "Product", render: (product) => <RecordThumb src={product.image} name={product.name} /> },
                { label: "Seller", render: (product) => product.seller },
                { label: "Category", render: (product) => product.category },
                { label: "Campus", render: (product) => product.campus },
                { label: "Price", render: (product) => product.price },
                { label: "Stock", render: (product) => product.stock },
                { label: "Stock status", render: (product) => <StatusBadge status={product.stockStatus} /> },
                { label: "Listing status", render: (product) => <StatusBadge status={product.status} /> },
                { label: "Flag", render: (product) => <StatusBadge status={product.flag} /> },
                { label: "Uploaded", render: (product) => product.dateUploaded },
              ]}
              actions={(product) => (
                <>
                  <ActionButton tone="success" onClick={() => changeStatus("products", product.id, "approved")}>Approve</ActionButton>
                  <ActionButton tone="danger" onClick={() => changeStatus("products", product.id, "rejected")}>Reject</ActionButton>
                  <ActionButton tone="soft" onClick={() => changeStatus("products", product.id, "hidden")}>Hide</ActionButton>
                  <ActionButton tone="success" onClick={() => markProductInStock(product)}>In Stock</ActionButton>
                  <ActionButton tone="soft" onClick={() => markProductOutOfStock(product)}>Out Stock</ActionButton>
                  <ActionButton tone="danger" onClick={() => changeFields("products", product.id, { flag: "reported" })}>Suspicious</ActionButton>
                  <ActionButton tone="danger" onClick={() => removeRecord("products", product.id, product.name)}>Delete</ActionButton>
                </>
              )}
            />
          ) : null}

          {activeTab === "marketplace" ? (
            <DataTable<AdminUsedItem>
              title="Used Market Approvals"
              subtitle="Approve, reject, remove and mark used-item listings as safe or unsafe from the user dashboard."
              rows={data.usedItems}
              search={search}
              onView={(item) => openRecord(item.name, item)}
              columns={[
                { label: "Item", render: (item) => <RecordThumb src={item.image} name={item.name} /> },
                { label: "Uploader", render: (item) => item.uploader },
                { label: "Phone", render: (item) => item.uploaderPhone },
                { label: "Contact", render: (item) => <StatusBadge status={item.contactStatus} /> },
                { label: "Campus", render: (item) => item.campus },
                { label: "Condition", render: (item) => <StatusBadge status={item.condition} /> },
                { label: "Price", render: (item) => item.price },
                { label: "Approval", render: (item) => <StatusBadge status={item.status} /> },
                { label: "Safety", render: (item) => <StatusBadge status={item.safetyStatus} /> },
                { label: "Submitted", render: (item) => item.dateSubmitted },
              ]}
              actions={(item) => (
                <>
                  <ActionButton tone="success" onClick={() => changeFields("usedItems", item.id, { status: "approved", safetyStatus: "safe" })}>Approve</ActionButton>
                  <ActionButton tone="danger" onClick={() => rejectUsedItem(item)}>Reject</ActionButton>
                  <ActionButton tone="soft" onClick={() => changeStatus("usedItems", item.id, "removed")}>Remove</ActionButton>
                  <ActionButton tone="success" onClick={() => changeFields("usedItems", item.id, { safetyStatus: "safe" })}>Safe</ActionButton>
                  <ActionButton tone="danger" onClick={() => changeFields("usedItems", item.id, { safetyStatus: "unsafe", status: item.status === "approved" ? "removed" : item.status })}>Unsafe</ActionButton>
                </>
              )}
            />
          ) : null}

          {activeTab === "orders" ? (
            <DataTable<AdminOrder>
              title="Order Management"
              subtitle="Monitor buyer orders from payment confirmation to delivery code verification and refund handling."
              rows={data.orders}
              search={search}
              onView={(order) => openRecord(order.id, order)}
              columns={[
                { label: "Order ID", render: (order) => order.id },
                { label: "Buyer", render: (order) => order.buyer },
                { label: "Seller", render: (order) => order.seller },
                { label: "Product", render: (order) => order.item },
                { label: "Amount", render: (order) => order.amount },
                { label: "Payment", render: (order) => <StatusBadge status={order.paymentStatus} /> },
                { label: "Delivery", render: (order) => <StatusBadge status={order.deliveryStatus} /> },
                { label: "Order", render: (order) => <StatusBadge status={order.orderStatus} /> },
                { label: "Created", render: (order) => order.createdAt },
              ]}
              actions={(order) => (
                <>
                  <ActionButton tone="soft" onClick={() => openRecord(`${order.id} delivery code`, { order: order.id, deliveryCode: order.deliveryCode, codeStatus: order.deliveryStatus, pickupPoint: order.pickupPoint })}>Code</ActionButton>
                  <ActionButton tone="soft" onClick={() => openRecord(`${order.id} parties`, { buyer: order.buyer, seller: order.seller, campus: order.campus, item: order.item })}>Buyer/Seller</ActionButton>
                  <ActionButton tone="success" onClick={() => changeStatus("orders", order.id, "completed", "orderStatus")}>Complete</ActionButton>
                  <ActionButton tone="soft" onClick={() => changeStatus("orders", order.id, "preparing", "orderStatus")}>Preparing</ActionButton>
                  <ActionButton tone="soft" onClick={() => changeStatus("orders", order.id, "out_for_delivery", "deliveryStatus")}>Out Delivery</ActionButton>
                  <ActionButton tone="danger" onClick={() => openRecord(`${order.id} refund review`, { order: order.id, paymentStatus: order.paymentStatus, note: "Refunds must be reconciled through the payment provider workflow." })}>Refund Review</ActionButton>
                  <ActionButton tone="danger" onClick={() => changeStatus("orders", order.id, "cancelled", "orderStatus")}>Cancel</ActionButton>
                </>
              )}
            />
          ) : null}

          {activeTab === "finance" ? (
            <DataTable<AdminPayment>
              title="Payment Monitoring"
              subtitle="Track payment reference, buyer, seller, order amount, Gleenc fee, seller amount and payout status."
              rows={data.payments}
              search={search}
              onView={(payment) => openRecord(payment.id, payment)}
              columns={[
                { label: "Payment Ref", render: (payment) => payment.id },
                { label: "Order", render: (payment) => payment.orderId },
                { label: "Buyer", render: (payment) => payment.buyer },
                { label: "Seller", render: (payment) => payment.seller },
                { label: "Amount paid", render: (payment) => payment.amount },
                { label: "Gleenc fee", render: (payment) => payment.gleankFee },
                { label: "Seller amount", render: (payment) => payment.sellerAmount },
                { label: "Payment", render: (payment) => <StatusBadge status={payment.status} /> },
                { label: "Payout", render: (payment) => <StatusBadge status={payment.payoutStatus} /> },
                { label: "Date", render: (payment) => payment.createdAt },
              ]}
              actions={(payment) => (
                <ActionButton tone="soft" onClick={() => openRecord(payment.id, payment)}>
                  View provider record
                </ActionButton>
              )}
            />
          ) : null}

          {activeTab === "finance" ? (
            <DataTable<AdminPayment>
              title="Seller Payouts"
              subtitle="Release seller funds only after payment and delivery verification rules are satisfied."
              rows={payoutRows}
              search={search}
              onView={(payment) => openRecord(payment.id, payment)}
              columns={[
                { label: "Payment", render: (payment) => payment.id },
                { label: "Seller", render: (payment) => payment.seller },
                { label: "Seller amount", render: (payment) => payment.sellerAmount },
                { label: "Gleenc fee", render: (payment) => payment.gleankFee },
                {
                  label: "Payout account",
                  render: (payment) =>
                    payment.payoutAccount
                      ? `${payment.payoutAccount.bankName} • ${payment.payoutAccount.accountName} • ${payment.payoutAccount.accountNumberMasked}`
                      : "Missing",
                },
                { label: "Payment", render: (payment) => <StatusBadge status={payment.status} /> },
                { label: "Payout", render: (payment) => <StatusBadge status={payment.payoutStatus} /> },
                { label: "Date", render: (payment) => payment.createdAt },
              ]}
              actions={(payment) => (
                <>
                  <ActionButton tone="success" onClick={() => changeStatus("payments", payment.id, "released", "payoutStatus")}>Release</ActionButton>
                  <ActionButton tone="soft" onClick={() => changeStatus("payments", payment.id, "on_hold", "payoutStatus")}>Hold</ActionButton>
                  <ActionButton tone="danger" onClick={() => changeStatus("payments", payment.id, "failed", "payoutStatus")}>Fail</ActionButton>
                </>
              )}
            />
          ) : null}

          {activeTab === "riders" ? (
            <section className="admin-filtered-table">
              <div className="admin-filter-row" aria-label="Rider filters">
                {[
                  ["all", "All riders"],
                  ["online", "Online"],
                  ["offline", "Offline"],
                  ["busy", "Busy"],
                  ["pending", "Verification pending"],
                  ["suspended", "Suspended"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={riderFilter === value ? "active" : ""}
                    onClick={() => setRiderFilter(value)}
                  >
                    {label}
                  </button>
                ))}
                {riderLocations.map((location) => (
                  <button
                    key={location}
                    type="button"
                    className={riderFilter === location ? "active" : ""}
                    onClick={() => setRiderFilter(location)}
                  >
                    {location}
                  </button>
                ))}
              </div>

              <div className="admin-panel-card">
                <div className="admin-panel-head">
                  <div>
                    <h2>Requirement-based verification queue</h2>
                    <p>Review each submission. A stage approval stays inactive until every requirement in that stage is complete.</p>
                  </div>
                </div>
                <div className="admin-mini-grid">
                  <MiniQueue title="New" value={verificationQueueCounts.newSubmissions || 0} helper="First-time submissions" tone="orange" />
                  <MiniQueue title="Resubmitted" value={verificationQueueCounts.resubmitted || 0} helper="Replacement versions" tone="blue" />
                  <MiniQueue title="Reopen requests" value={verificationQueueCounts.resubmissionRequests || 0} helper="Approved forms waiting for admin" tone="orange" />
                  <MiniQueue title="Under review" value={verificationQueueCounts.underReview || 0} helper="Currently being checked" tone="blue" />
                  <MiniQueue title="Approved" value={verificationQueueCounts.completedApproved || 0} helper="Completed cases" tone="green" />
                </div>
                <div className="admin-card-grid">
                  {verificationCaseRows.map((row) => {
                    const reviewable = row.requirements.find((requirement) =>
                      ["submitted", "under_review"].includes(requirement.status),
                    );
                    const pendingResubmission = row.requirements.find(
                      (requirement) => requirement.resubmissionRequest?.status === "pending",
                    );
                    const nextStage = nextVerificationStage(row);
                    return (
                      <article key={row.id} className="admin-record-card">
                        <div>
                          <span className="admin-pill">{row.role}{row.sellerType ? ` · ${row.sellerType}` : ""}</span>
                          <h3>{row.user?.name || row.user?.email || row.userId}</h3>
                          <p>{row.completionPercent}% complete · Stage {row.currentVerifiedLevel} of 3</p>
                        </div>
                        <div className="admin-record-card-status">
                          <StatusBadge status={row.overallStatus} />
                          <StatusBadge status={row.operationalStatus} />
                        </div>
                        {row.eligibility?.blockingReasons?.length ? (
                          <p className="admin-muted-text">{row.eligibility.blockingReasons.slice(0, 2).map((reason) => reason.message).join(" ")}</p>
                        ) : null}
                        {pendingResubmission ? (
                          <div className="admin-card-note">
                            <strong>Request to reopen {pendingResubmission.title}</strong>
                            <p className="admin-muted-text">
                              {pendingResubmission.resubmissionRequest?.reason}
                            </p>
                            <div className="admin-card-actions">
                              <ActionButton
                                tone="success"
                                onClick={() => decideVerificationResubmission(pendingResubmission, "approve")}
                              >
                                Open form
                              </ActionButton>
                              <ActionButton
                                tone="danger"
                                onClick={() => decideVerificationResubmission(pendingResubmission, "reject")}
                              >
                                Keep locked
                              </ActionButton>
                            </div>
                          </div>
                        ) : null}
                        {reviewable ? (
                          <div className="admin-card-actions">
                            <ActionButton tone="soft" onClick={() => openRecord(`${row.user?.name || row.userId} verification`, row as unknown as Record<string, unknown>)}>Details</ActionButton>
                            <ActionButton tone="soft" onClick={() => reviewVerificationRequirement(reviewable.id, "mark_under_review", "Admin started reviewing this requirement.")}>Review</ActionButton>
                            <ActionButton tone="success" onClick={() => reviewVerificationRequirement(reviewable.id, "approve", "Requirement approved.")}>Approve item</ActionButton>
                            <ActionButton tone="soft" onClick={() => reviewVerificationRequirement(reviewable.id, "needs_information", "Please replace this requirement with clearer information.")}>Correction</ActionButton>
                            <ActionButton tone="danger" onClick={() => reviewVerificationRequirement(reviewable.id, "reject", "Requirement rejected after admin review.")}>Reject</ActionButton>
                            <ActionButton
                              tone="success"
                              disabled={!nextStage?.approvalReady}
                              onClick={() => approveVerificationLevel(row)}
                            >
                              {nextStage?.approvalReady
                                ? `Approve Stage ${nextStage.stage}`
                                : `Stage ${nextStage?.stage || 3} incomplete`}
                            </ActionButton>
                          </div>
                        ) : (
                          <div className="admin-card-actions">
                            <ActionButton tone="soft" onClick={() => openRecord(`${row.user?.name || row.userId} verification`, row as unknown as Record<string, unknown>)}>Details</ActionButton>
                            <ActionButton
                              tone="success"
                              disabled={!nextStage?.approvalReady}
                              onClick={() => approveVerificationLevel(row)}
                            >
                              {nextStage?.approvalReady
                                ? `Approve Stage ${nextStage.stage}`
                                : row.currentVerifiedLevel >= 3
                                  ? "All stages approved"
                                  : `Stage ${nextStage?.stage || 1} incomplete`}
                            </ActionButton>
                          </div>
                        )}
                      </article>
                    );
                  })}
                  {!verificationCaseRows.length ? (
                    <div className="admin-empty-card">No requirement-based verification cases yet.</div>
                  ) : null}
                </div>
              </div>

              <DataTable<AdminRider>
                title="Rider Management"
                subtitle="Review rider accounts by location/coverage, online status, verification, safety state and delivery history before riders can handle assignments."
                rows={riderRows}
                search={search}
                onView={(rider) => openRecord(rider.fullName || rider.name, rider as unknown as Record<string, unknown>)}
                columns={[
                  { label: "Rider", render: (rider) => rider.fullName || rider.name },
                  { label: "Email", render: (rider) => rider.email },
                  { label: "Email verified", render: (rider) => <StatusBadge status={rider.emailVerified ? "verified" : "pending"} /> },
                  { label: "Phone", render: (rider) => rider.phone },
                  { label: "Phone verified", render: (rider) => <StatusBadge status={rider.phoneVerified ? "verified" : "pending"} /> },
                  { label: "Vehicle", render: (rider) => rider.vehiclePlate ? `${rider.vehicleType} · ${rider.vehiclePlate}` : rider.vehicleType || "Not added" },
                  { label: "Coverage/location", render: (rider) => rider.coverageArea || rider.homeAddress || "Not set" },
                  { label: "Verification", render: (rider) => <StatusBadge status={rider.verificationStatus} /> },
                  { label: "Completion", render: (rider) => `${rider.profileCompletionPercent || 0}%` },
                  {
                    label: "Stages",
                    render: (rider) => {
                      const stages = Object.values(rider.verificationStages || {});
                      return `${stages.filter(Boolean).length}/${stages.length || 4}`;
                    },
                  },
                  { label: "Safety", render: (rider) => <StatusBadge status={rider.safetyStatus} /> },
                  { label: "Availability", render: (rider) => <StatusBadge status={rider.availability} /> },
                  { label: "Completed", render: (rider) => rider.completedDeliveries },
                  { label: "Last updated", render: (rider) => rider.updatedAt ? formatAdminTime(rider.updatedAt) : "Not available" },
                ]}
                actions={(rider) => {
                  const riderCase = verificationQueues.cases.find((item) => item.role === "rider" && item.userId === rider.userId);
                  const nextStage = riderCase ? nextVerificationStage(riderCase) : undefined;
                  const riderReviewable = riderCase?.requirements.find((requirement) =>
                    ["submitted", "under_review"].includes(requirement.status),
                  );
                  return (
                  <>
                    <ActionButton
                      tone="soft"
                      onClick={() => openRecord(`${rider.fullName || rider.name} details`, rider as unknown as Record<string, unknown>)}
                    >
                      Details
                    </ActionButton>
                    <ActionButton
                      tone="success"
                      disabled={!riderCase || !nextStage?.approvalReady}
                      onClick={() => riderCase ? approveVerificationLevel(riderCase) : undefined}
                    >
                      {riderCase?.currentVerifiedLevel === 3
                        ? "All stages approved"
                        : nextStage?.approvalReady
                          ? `Approve Stage ${nextStage.stage}`
                          : `Stage ${nextStage?.stage || 1} incomplete`}
                    </ActionButton>
                    <ActionButton
                      tone="soft"
                      disabled={Boolean(
                        rider.capacityChangeUnlockedUntil &&
                          new Date(rider.capacityChangeUnlockedUntil).getTime() > Date.now(),
                      )}
                      onClick={() => unlockRiderCapacity(rider)}
                    >
                      Unlock capacity
                    </ActionButton>
                    <ActionButton
                      tone="soft"
                      disabled={!riderReviewable}
                      onClick={() => riderReviewable
                        ? reviewVerificationRequirement(
                            riderReviewable.id,
                            "needs_information",
                            "Please replace this requirement with clearer information.",
                          )
                        : undefined}
                    >
                      Needs Info
                    </ActionButton>
                    <ActionButton
                      tone="danger"
                      disabled={!riderReviewable}
                      onClick={() => riderReviewable
                        ? reviewVerificationRequirement(
                            riderReviewable.id,
                            "reject",
                            "This verification requirement was rejected after admin review.",
                          )
                        : undefined}
                    >
                      Reject submission
                    </ActionButton>
                    <ActionButton
                      tone="danger"
                      onClick={() => changeRiderVerification(rider, "suspended", "Rider account suspended by admin.", "suspended")}
                    >
                      Suspend
                    </ActionButton>
                  </>
                  );
                }}
              />
            </section>
          ) : null}

          {activeTab === "disputes" ? (
            <section className="admin-filtered-table">
              <div className="admin-filter-row" aria-label="Dispute filters">
                {[
                  ["all", "All Issues"],
                  ["buyer", "Buyer"],
                  ["seller", "Seller"],
                  ["rider", "Rider"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={disputeFilter === value ? "active" : ""}
                    onClick={() => setDisputeFilter(value as typeof disputeFilter)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <DataTable<AdminDispute>
                title="Disputes and Complaints"
                subtitle="Resolve buyer, seller and rider reports, request evidence, approve refunds and protect platform trust."
                rows={disputeRows}
                search={search}
                onView={(dispute) => openRecord(dispute.title, dispute)}
                columns={[
                  { label: "Complaint ID", render: (dispute) => dispute.id },
                  { label: "Order", render: (dispute) => dispute.orderId },
                  { label: "Buyer", render: (dispute) => dispute.buyer || "Not applicable" },
                  { label: "Seller/Rider", render: (dispute) => dispute.seller || "Not applicable" },
                  { label: "Type", render: (dispute) => dispute.type },
                  { label: "Message", render: (dispute) => <span className="admin-message-cell">{dispute.message}</span> },
                  { label: "Priority", render: (dispute) => <StatusBadge status={dispute.priority} /> },
                  { label: "Status", render: (dispute) => <StatusBadge status={dispute.status} /> },
                  { label: "Date", render: (dispute) => dispute.createdAt },
                ]}
                actions={(dispute) => (
                  <>
                    <ActionButton tone="soft" onClick={() => changeStatus("disputes", dispute.id, "reviewing")}>Review</ActionButton>
                    <ActionButton tone="soft" onClick={() => changeStatus("disputes", dispute.id, "waiting_for_buyer")}>Ask Buyer</ActionButton>
                    <ActionButton tone="soft" onClick={() => changeStatus("disputes", dispute.id, "waiting_for_seller")}>Ask Seller</ActionButton>
                    <ActionButton tone="success" onClick={() => changeFields("disputes", dispute.id, { status: "resolved", actionTaken: "Refund approved or dispute settled by admin." })}>Approve Refund</ActionButton>
                    <ActionButton tone="success" onClick={() => changeStatus("disputes", dispute.id, "resolved")}>Resolve</ActionButton>
                    <ActionButton tone="danger" onClick={() => changeStatus("disputes", dispute.id, "rejected")}>Reject</ActionButton>
                  </>
                )}
              />
            </section>
          ) : null}

          {activeTab === "support" ? (
            <AdminSupportInbox
              conversations={supportRows}
              draftById={supportDrafts}
              replyingConversationId={replyingConversationId}
              onDraftChange={updateSupportDraft}
              onReply={(conversation) => void replyToSupportConversation(conversation)}
              onMarkRead={(conversation) => void markSupportRead(conversation)}
            />
          ) : null}

          {activeTab === "activityLogs" ? (
            <div className="admin-stage3-grid">
              <DataTable<AdminAuditLog>
                title="Stage 3 Audit Trail"
                subtitle="Live admin actions for KYC, price controls and trust operations."
                rows={auditLogs}
                search={search}
                onView={(log) => openRecord(log.action, log as unknown as Record<string, unknown>)}
                columns={[
                  { label: "Admin", render: (log) => log.adminName },
                  { label: "Action", render: (log) => log.action },
                  { label: "Target", render: (log) => `${log.targetType} ${log.targetId}`.trim() },
                  { label: "Summary", render: (log) => log.summary },
                  { label: "Time", render: (log) => formatAdminTime(log.createdAt) },
                ]}
              />

              <DataTable<AdminActivityLog>
                title="Platform Activity Logs"
                subtitle="Existing user, seller, rider and order activity snapshots."
                rows={data.activityLogs}
                search={search}
                onView={(log) => openRecord(log.action, log)}
                columns={[
                  { label: "Admin", render: (log) => log.admin },
                  { label: "Action", render: (log) => log.action },
                  { label: "Target", render: (log) => log.target },
                  { label: "Time", render: (log) => log.time },
                ]}
              />
            </div>
          ) : null}

          {activeTab === "settings" ? (
            <section className="admin-settings-grid">
              <DataTable<AdminKycVerification>
                title="Stage 3 Verification Reviews"
                subtitle="Review manual/mock/Dojah KYC records for sellers and riders. Approved accounts sync back to their dashboard profile completion."
                rows={kycRows}
                search={search}
                onView={(row) => openRecord(`${row.user.name} verification`, row as unknown as Record<string, unknown>)}
                columns={[
                  { label: "Account", render: (row) => row.user.name },
                  { label: "Role", render: (row) => row.role },
                  { label: "Provider", render: (row) => row.provider },
                  { label: "Status", render: (row) => <StatusBadge status={row.status} /> },
                  { label: "Review", render: (row) => <StatusBadge status={row.adminReviewStatus} /> },
                  { label: "Completion", render: (row) => `${row.completionPercent || 0}%` },
                ]}
                actions={(row) => (
                  <>
                    <ActionButton
                      tone="success"
                      disabled={row.status === "verified" || row.adminReviewStatus === "approved"}
                      onClick={() => decideKycReview(row, "approve")}
                    >
                      {row.status === "verified" || row.adminReviewStatus === "approved" ? "Approved" : "Approve"}
                    </ActionButton>
                    <ActionButton tone="soft" onClick={() => decideKycReview(row, "request-resubmission")}>More Info</ActionButton>
                    <ActionButton tone="danger" onClick={() => decideKycReview(row, "reject")}>Reject</ActionButton>
                  </>
                )}
              />

              <DataTable<AdminPriceRange>
                title="Price Validation Ranges"
                subtitle="Control category price ranges used to warn, review or block suspicious product pricing."
                rows={priceRanges}
                search={search}
                onView={(range) => openRecord(`${range.category} price range`, range as unknown as Record<string, unknown>)}
                columns={[
                  { label: "Category", render: (range) => range.category },
                  { label: "Seller type", render: (range) => range.sellerType },
                  { label: "Scope", render: (range) => range.marketScope },
                  { label: "Min", render: (range) => `₦${range.minPrice.toLocaleString()}` },
                  { label: "Max", render: (range) => `₦${range.maxPrice.toLocaleString()}` },
                  { label: "Action", render: (range) => <StatusBadge status={range.action} /> },
                ]}
                actions={(range) => (
                  <>
                    <ActionButton tone="success" onClick={() => void createPriceRangeFromPrompt()}>New Range</ActionButton>
                    <ActionButton tone="soft" onClick={() => void togglePriceRange(range)}>{range.isActive ? "Disable" : "Enable"}</ActionButton>
                    <ActionButton tone="danger" onClick={() => void removePriceRange(range)}>Delete</ActionButton>
                  </>
                )}
              />

              <div className="admin-panel-card">
                <div className="admin-panel-head">
                  <div>
                    <h2>Admin Integration Rules</h2>
                    <p>These are the live rules currently enforced between user, seller and admin sections.</p>
                  </div>
                </div>
                <div className="admin-rules-list">
                  <div><FaUsers /><span>User used-market upload must enter <strong>pending</strong> status before public listing.</span></div>
                  <div><FaStore /><span>Seller product/service upload must enter <strong>pending</strong> status before visibility.</span></div>
                  <div><FaCreditCard /><span>Order must become valid only after payment gateway verification returns <strong>successful</strong>.</span></div>
                  <div><FaTruck /><span>Seller payout should remain <strong>on_hold</strong> until delivery code is verified.</span></div>
                  <div><FaExclamationTriangle /><span>Buyer/seller complaints must appear in the dispute queue with an order or item reference.</span></div>
                </div>
              </div>

              <div className="admin-panel-card">
                <div className="admin-panel-head">
                  <div>
                    <h2>Admin Data</h2>
                    <p>Refresh users, sellers, riders, orders, products, payouts, disputes and support records.</p>
                  </div>
                </div>
                <div className="admin-settings-actions">
                  <button type="button" onClick={() => void createPriceRangeFromPrompt()}><FaShieldAlt /> Add price range</button>
                  <button type="button" onClick={() => void refreshLiveData()}><FaUndo /> Refresh admin data</button>
                  <button type="button" onClick={() => setLogoutModalOpen(true)}><FaBan /> Logout admin session</button>
                </div>
              </div>

            </section>
          ) : null}
        </section>
      </main>

      <DetailDrawer title={selectedRecord?.title || "Record"} item={selectedRecord?.item || null} onClose={() => setSelectedRecord(null)} />

      <LogoutConfirmModal
        isOpen={logoutModalOpen}
        onCancel={() => setLogoutModalOpen(false)}
        onConfirm={logout}
      />
    </section>
  );
}

export default AdminDashboard;
