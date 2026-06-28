import { useEffect, useMemo, useState } from "react";
import type { FormEvent, JSX } from "react";
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
  initialAdminDataset,
  type AdminActivityLog,
  type AdminDataset,
  type AdminDelivery,
  type AdminDispute,
  type AdminFeedback,
  type AdminOrder,
  type AdminPayment,
  type AdminProduct,
  type AdminSeller,
  type AdminStatus,
  type AdminUsedItem,
  type AdminUser,
} from "./adminData";
import { adminLogin, clearAdminToken, deleteAdminRecord, fetchAdminDataset, getAdminToken, resetAdminDemoData, updateAdminRecordFields, updateAdminRecordStatus } from "./adminApi";
import "./AdminDashboard.css";

type AdminTab =
  | "overview"
  | "users"
  | "sellers"
  | "products"
  | "usedMarket"
  | "orders"
  | "payments"
  | "payouts"
  | "deliveries"
  | "disputes"
  | "feedback"
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
  { id: "products", label: "Products", icon: <FaBoxOpen />, description: "Seller listings" },
  { id: "usedMarket", label: "Used Market", icon: <FaShoppingBag />, description: "Used-item approvals" },
  { id: "orders", label: "Orders", icon: <FaClipboardList />, description: "Order control" },
  { id: "payments", label: "Payments", icon: <FaCreditCard />, description: "Gateway records" },
  { id: "payouts", label: "Payouts", icon: <FaMoneyBillWave />, description: "Seller funds" },
  { id: "deliveries", label: "Deliveries", icon: <FaTruck />, description: "Rider and codes" },
  { id: "disputes", label: "Disputes", icon: <FaExclamationTriangle />, description: "Complaints" },
  { id: "feedback", label: "Feedback", icon: <FaCommentDots />, description: "Platform feedback" },
  { id: "activityLogs", label: "Activity Logs", icon: <FaHistory />, description: "Admin actions" },
  { id: "settings", label: "Settings", icon: <FaCog />, description: "Rules and setup" },
];

function slugStatus(status: string) {
  return status.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function prettyStatus(status: AdminStatus | string | boolean) {
  if (typeof status === "boolean") return status ? "Yes" : "No";
  return status.replace(/_/g, " ");
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
      {src ? <img src={src} alt={name} className="admin-record-thumb" /> : <span className="admin-record-thumb fallback">{initials}</span>}
      <strong>{name}</strong>
    </div>
  );
}

function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("admin@gleank.com");
  const [password, setPassword] = useState("admin12345");
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
            <p>Gleank Admin</p>
            <h1>Platform Control Center</h1>
          </div>
        </div>
        <p className="admin-login-copy">
          Manage approvals, users, sellers, products, orders, payments, payouts, deliveries, disputes and feedback from one secure dashboard.
        </p>

        <form onSubmit={handleSubmit} className="admin-login-form">
          <label>
            Admin email
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="admin@gleank.com" />
          </label>
          <label>
            Password
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="Enter password" />
          </label>
          {error ? <div className="admin-error-text">{error}</div> : null}
          <button type="submit" disabled={loading}>{loading ? "Checking access..." : "Login to Admin"}</button>
        </form>

        <div className="admin-demo-note">
          Demo access: <strong>admin@gleank.com</strong> / <strong>admin12345</strong>
        </div>
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

function ActionButton({ children, tone = "default", onClick }: { children: string; tone?: "default" | "danger" | "success" | "soft"; onClick: () => void }) {
  return (
    <button className={`admin-action-btn ${tone}`} type="button" onClick={onClick}>
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

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              {columns.map((column) => <th key={column.label}>{column.label}</th>)}
              {onView || actions ? <th>Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.id}>
                {columns.map((column) => <td key={column.label}>{column.render(row)}</td>)}
                {onView || actions ? (
                  <td>
                    <div className="admin-row-actions">
                      {onView ? (
                        <button type="button" className="soft" onClick={() => onView(row)}>
                          <FaEye /> View
                        </button>
                      ) : null}
                      {actions ? actions(row) : null}
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredRows.length === 0 ? <div className="admin-empty-state">No records match your current search.</div> : null}
    </section>
  );
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
              <strong>{typeof value === "boolean" ? prettyStatus(value) : String(value ?? "Not available")}</strong>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

function AdminDashboard() {
  const [isLoggedIn, setIsLoggedIn] = useState(Boolean(getAdminToken()));
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<AdminDataset>(initialAdminDataset);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<{ title: string; item: Record<string, unknown> } | null>(null);

  useEffect(() => {
    if (!isLoggedIn) return;
    let active = true;
    setLoading(true);

    fetchAdminDataset()
      .then((payload) => {
        if (active) setData(payload);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isLoggedIn]);

  const currentTab = tabs.find((tab) => tab.id === activeTab) || tabs[0];
  const payoutRows = data.payments.filter((payment) => payment.payoutStatus !== "released");

  function logout() {
    clearAdminToken();
    setIsLoggedIn(false);
  }

  function openRecord(title: string, item: Record<string, unknown>) {
    setSelectedRecord({ title, item });
  }

  async function changeStatus(collection: AdminCollection, id: string, status: AdminStatus, field = "status") {
    const response = await updateAdminRecordStatus(collection, id, status, field);
    setData(response.data);
  }


  async function changeFields(collection: AdminCollection, id: string, fields: Record<string, unknown>) {
    const response = await updateAdminRecordFields(collection, id, fields);
    setData(response.data);
  }

  async function removeRecord(collection: AdminCollection, id: string, label: string) {
    const confirmed = window.confirm(`Delete ${label}? This demo action removes the record from the admin table.`);
    if (!confirmed) return;

    const response = await deleteAdminRecord(collection, id);
    setData(response.data);
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

  function resetDemo() {
    setData(resetAdminDemoData());
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
              <strong>Gleank</strong>
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

        <button className="admin-logout" onClick={logout} type="button">
          <FaSignOutAlt /> Logout
        </button>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div>
            <p>Phase 7 Admin</p>
            <h1>{currentTab.label}</h1>
          </div>
          <div className="admin-topbar-actions">
            <div className="admin-search-box">
              <FaSearch />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users, sellers, orders..." />
            </div>
            <button className="admin-notification" type="button" title="Notifications">
              <FaBell />
              <span>{data.overview.openDisputes + data.overview.unreadFeedback}</span>
            </button>
            <div className="admin-profile-pill">
              <FaUserShield />
              <span>Admin</span>
            </div>
          </div>
        </header>

        <section className="admin-content">
          {loading ? <div className="admin-loading-card">Loading admin data...</div> : null}

          {activeTab === "overview" ? (
            <>
              <section className="admin-hero-card">
                <div>
                  <span className="admin-pill"><FaShieldAlt /> Platform safety center</span>
                  <h2>Control the full Gleank marketplace from one full-page admin dashboard.</h2>
                  <p>
                    This area is prepared for user, seller, product, used-market, order, payment, payout, delivery, dispute and feedback integrations.
                  </p>
                </div>
                <div className="admin-hero-metric">
                  <FaCheckCircle />
                  <strong>{data.overview.openDisputes}</strong>
                  <span>open disputes</span>
                </div>
              </section>

              <section className="admin-stats-grid">
                <StatCard label="Total Users" value={data.overview.totalUsers} helper="registered buyer accounts" icon={<FaUsers />} />
                <StatCard label="Total Sellers" value={data.overview.totalSellers} helper="campus stores onboarded" icon={<FaStore />} />
                <StatCard label="Pending Sellers" value={data.overview.pendingSellerVerifications} helper="verification reviews" icon={<FaShieldAlt />} />
                <StatCard label="Active Products" value={data.overview.activeProducts} helper="approved listings" icon={<FaBoxOpen />} />
                <StatCard label="Pending Products" value={data.overview.pendingProducts} helper="seller uploads awaiting review" icon={<FaClipboardList />} />
                <StatCard label="Used Items" value={data.overview.pendingUsedItems} helper="used-market approvals" icon={<FaShoppingBag />} />
                <StatCard label="Orders" value={data.overview.totalOrders} helper="all platform orders" icon={<FaClipboardList />} />
                <StatCard label="Deliveries" value={data.overview.pendingDeliveries} helper="not yet verified" icon={<FaTruck />} />
                <StatCard label="Revenue" value={data.overview.totalRevenue} helper="tracked transaction volume" icon={<FaCreditCard />} />
                <StatCard label="Payouts" value={data.overview.pendingPayouts} helper="seller funds needing action" icon={<FaMoneyBillWave />} />
                <StatCard label="Disputes" value={data.overview.openDisputes} helper="open or reviewing" icon={<FaExclamationTriangle />} />
                <StatCard label="Feedback" value={data.overview.unreadFeedback} helper="unread messages" icon={<FaCommentDots />} />
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
                    <MiniQueue title="Used market approvals" value={data.usedItems.filter((item) => item.status === "pending").length} helper="Review campus used-item uploads" tone="blue" />
                    <MiniQueue title="Open disputes" value={data.disputes.filter((item) => item.status === "open" || item.status === "reviewing").length} helper="Buyer/seller complaints" tone="red" />
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
                    <div><strong>User upload</strong><span>Used item enters pending approval queue.</span></div>
                    <div><strong>Seller upload</strong><span>Product/service waits for admin approval.</span></div>
                    <div><strong>Order paid</strong><span>Admin monitors payment, delivery and payout release.</span></div>
                    <div><strong>Complaint sent</strong><span>Dispute appears for admin review and resolution.</span></div>
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
                  <ActionButton tone="soft" onClick={() => openRecord(`${user.name} orders`, { user: user.name, orderCount: user.orders, note: "This links to user order history when the real backend is connected." })}>Orders</ActionButton>
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
                { label: "Status", render: (seller) => <StatusBadge status={seller.status} /> },
                { label: "Payout", render: (seller) => <StatusBadge status={seller.payoutStatus} /> },
                { label: "Joined", render: (seller) => seller.joined },
              ]}
              actions={(seller) => (
                <>
                  <ActionButton tone="soft" onClick={() => openRecord(`${seller.storeName} store`, { storeName: seller.storeName, owner: seller.ownerName, category: seller.category, rating: seller.rating, note: "This links to the public seller store when seller pages are connected." })}>Store</ActionButton>
                  <ActionButton tone="soft" onClick={() => openRecord(`${seller.storeName} products`, { storeName: seller.storeName, products: seller.products, note: "This links to all products/services uploaded by this seller." })}>Products</ActionButton>
                  <ActionButton tone="soft" onClick={() => openRecord(`${seller.storeName} orders`, { storeName: seller.storeName, orders: seller.orders, note: "This links to seller order history." })}>Orders</ActionButton>
                  <ActionButton tone="soft" onClick={() => openRecord(`${seller.storeName} payout`, { storeName: seller.storeName, payoutStatus: seller.payoutStatus, bankStatus: seller.bankStatus, earnings: seller.earnings })}>Payout</ActionButton>
                  <ActionButton tone="success" onClick={() => changeFields("sellers", seller.id, { verificationStatus: "approved", status: "active" })}>Approve</ActionButton>
                  <ActionButton tone="danger" onClick={() => changeStatus("sellers", seller.id, "rejected", "verificationStatus")}>Reject</ActionButton>
                  <ActionButton tone="soft" onClick={() => changeStatus("sellers", seller.id, "active")}>Activate</ActionButton>
                  <ActionButton tone="danger" onClick={() => changeStatus("sellers", seller.id, "suspended")}>Suspend</ActionButton>
                  <ActionButton tone="danger" onClick={() => removeRecord("sellers", seller.id, seller.storeName)}>Delete</ActionButton>
                </>
              )}
            />
          ) : null}

          {activeTab === "products" ? (
            <DataTable<AdminProduct>
              title="Product and Service Management"
              subtitle="Control seller products/services, approval status, stock state and listing safety before buyers see them."
              rows={data.products}
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

          {activeTab === "usedMarket" ? (
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
                  <ActionButton tone="danger" onClick={() => changeFields("orders", order.id, { orderStatus: "refunded", paymentStatus: "refunded" })}>Refund</ActionButton>
                  <ActionButton tone="danger" onClick={() => changeStatus("orders", order.id, "cancelled", "orderStatus")}>Cancel</ActionButton>
                </>
              )}
            />
          ) : null}

          {activeTab === "payments" ? (
            <DataTable<AdminPayment>
              title="Payment Monitoring"
              subtitle="Track payment reference, buyer, seller, order amount, Gleank fee, seller amount and payout status."
              rows={data.payments}
              search={search}
              onView={(payment) => openRecord(payment.id, payment)}
              columns={[
                { label: "Payment Ref", render: (payment) => payment.id },
                { label: "Order", render: (payment) => payment.orderId },
                { label: "Buyer", render: (payment) => payment.buyer },
                { label: "Seller", render: (payment) => payment.seller },
                { label: "Amount paid", render: (payment) => payment.amount },
                { label: "Gleank fee", render: (payment) => payment.gleankFee },
                { label: "Seller amount", render: (payment) => payment.sellerAmount },
                { label: "Payment", render: (payment) => <StatusBadge status={payment.status} /> },
                { label: "Payout", render: (payment) => <StatusBadge status={payment.payoutStatus} /> },
                { label: "Date", render: (payment) => payment.createdAt },
              ]}
              actions={(payment) => (
                <>
                  <ActionButton tone="success" onClick={() => changeStatus("payments", payment.id, "successful", "status")}>Successful</ActionButton>
                  <ActionButton tone="soft" onClick={() => changeStatus("payments", payment.id, "pending", "status")}>Pending</ActionButton>
                  <ActionButton tone="soft" onClick={() => changeStatus("payments", payment.id, "refunded", "status")}>Refund</ActionButton>
                  <ActionButton tone="danger" onClick={() => changeStatus("payments", payment.id, "failed", "status")}>Failed</ActionButton>
                </>
              )}
            />
          ) : null}

          {activeTab === "payouts" ? (
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
                { label: "Gleank fee", render: (payment) => payment.gleankFee },
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

          {activeTab === "deliveries" ? (
            <DataTable<AdminDelivery>
              title="Delivery Tracking"
              subtitle="Monitor buyer location, seller, rider assignment, pickup points and delivery code verification."
              rows={data.deliveries}
              search={search}
              onView={(delivery) => openRecord(delivery.id, delivery)}
              columns={[
                { label: "Order ID", render: (delivery) => delivery.orderId },
                { label: "Buyer location", render: (delivery) => delivery.buyerLocation },
                { label: "Seller", render: (delivery) => delivery.seller },
                { label: "Pickup point", render: (delivery) => delivery.pickupPoint },
                { label: "Rider", render: (delivery) => delivery.rider },
                { label: "Delivery", render: (delivery) => <StatusBadge status={delivery.status} /> },
                { label: "Code", render: (delivery) => <StatusBadge status={delivery.codeVerified ? "verified" : "pending"} /> },
                { label: "Updated", render: (delivery) => delivery.updatedAt },
              ]}
              actions={(delivery) => (
                <>
                  <ActionButton tone="soft" onClick={() => changeFields("deliveries", delivery.id, { status: "assigned", rider: delivery.rider === "Not assigned" ? "Assigned rider" : delivery.rider })}>Assign</ActionButton>
                  <ActionButton tone="soft" onClick={() => changeStatus("deliveries", delivery.id, "picked_up")}>Picked Up</ActionButton>
                  <ActionButton tone="soft" onClick={() => changeStatus("deliveries", delivery.id, "out_for_delivery")}>Out Delivery</ActionButton>
                  <ActionButton tone="success" onClick={() => changeStatus("deliveries", delivery.id, "verified")}>Verify Code</ActionButton>
                  <ActionButton tone="danger" onClick={() => changeStatus("deliveries", delivery.id, "failed")}>Problem</ActionButton>
                </>
              )}
            />
          ) : null}

          {activeTab === "disputes" ? (
            <DataTable<AdminDispute>
              title="Disputes and Complaints"
              subtitle="Resolve buyer-seller issues, request evidence, approve refunds and protect platform trust."
              rows={data.disputes}
              search={search}
              onView={(dispute) => openRecord(dispute.title, dispute)}
              columns={[
                { label: "Complaint ID", render: (dispute) => dispute.id },
                { label: "Order", render: (dispute) => dispute.orderId },
                { label: "Buyer", render: (dispute) => dispute.buyer },
                { label: "Seller", render: (dispute) => dispute.seller },
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
          ) : null}

          {activeTab === "feedback" ? (
            <DataTable<AdminFeedback>
              title="Feedback Management"
              subtitle="Read user and seller feedback and mark product, payment, delivery or app issues as resolved."
              rows={data.feedback}
              search={search}
              onView={(feedback) => openRecord(feedback.from, feedback)}
              columns={[
                { label: "Sender", render: (feedback) => feedback.from },
                { label: "Role", render: (feedback) => feedback.role },
                { label: "Category", render: (feedback) => feedback.category },
                { label: "Rating", render: (feedback) => `${feedback.rating}/5` },
                { label: "Message", render: (feedback) => <span className="admin-message-cell">{feedback.message}</span> },
                { label: "Status", render: (feedback) => <StatusBadge status={feedback.status} /> },
                { label: "Date", render: (feedback) => feedback.createdAt },
              ]}
              actions={(feedback) => (
                <>
                  <ActionButton tone="soft" onClick={() => changeStatus("feedback", feedback.id, "read")}>Read</ActionButton>
                  <ActionButton tone="soft" onClick={() => changeStatus("feedback", feedback.id, "reviewing")}>Review</ActionButton>
                  <ActionButton tone="success" onClick={() => changeStatus("feedback", feedback.id, "resolved")}>Resolve</ActionButton>
                </>
              )}
            />
          ) : null}

          {activeTab === "activityLogs" ? (
            <DataTable<AdminActivityLog>
              title="Admin Activity Logs"
              subtitle="Every important admin action should be recorded for safety and accountability."
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
          ) : null}

          {activeTab === "settings" ? (
            <section className="admin-settings-grid">
              <div className="admin-panel-card">
                <div className="admin-panel-head">
                  <div>
                    <h2>Admin Integration Rules</h2>
                    <p>These are the rules the user, seller and admin sections should follow when the backend is connected.</p>
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
                    <h2>Demo Data</h2>
                    <p>Use this during frontend testing only. Later, real backend records will replace the demo storage.</p>
                  </div>
                </div>
                <div className="admin-settings-actions">
                  <button type="button" onClick={resetDemo}><FaUndo /> Reset demo admin data</button>
                  <button type="button" onClick={logout}><FaBan /> Logout admin session</button>
                </div>
              </div>
            </section>
          ) : null}
        </section>
      </main>

      <DetailDrawer title={selectedRecord?.title || "Record"} item={selectedRecord?.item || null} onClose={() => setSelectedRecord(null)} />
    </section>
  );
}

export default AdminDashboard;
