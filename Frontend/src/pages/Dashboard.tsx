import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  FiActivity,
  FiAlertCircle,
  FiArchive,
  FiArrowDown,
  FiArrowUp,
  FiBarChart2,
  FiBox,
  FiCheckCircle,
  FiEdit3,
  FiEye,
  FiGrid,
  FiImage,
  FiPackage,
  FiPlus,
  FiRefreshCw,
  FiSave,
  FiShoppingBag,
  FiTrash2,
  FiUploadCloud,
  FiUsers,
  FiX,
} from "react-icons/fi";

import EmptyState from "../components/EmptyState";
import LoadingState from "../components/LoadingState";
import { formatNaira } from "../utils/price";
import { resolveMediaUrl } from "../utils/media";
import {
  createSellerHighlight,
  deleteSellerHighlight,
  deleteSellerProduct,
  deleteSellerService,
  getSellerWorkspace,
  reorderSellerHighlights,
  updateSellerHighlight,
  updateSellerStore,
} from "../services/seller.service";
import type {
  SellerProduct,
  SellerService,
  SellerWorkspace,
  StoreHighlight,
} from "../types/domain";

type DashboardTab = "overview" | "products" | "services" | "highlights" | "store";

type HighlightFormState = {
  id: string | null;
  title: string;
  category: string;
  sortOrder: number;
};

const emptyHighlightForm: HighlightFormState = {
  id: null,
  title: "",
  category: "",
  sortOrder: 0,
};

const mediaFallback =
  "https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=900&q=80";

function Dashboard() {
  const [workspace, setWorkspace] = useState<SellerWorkspace | null>(null);
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingStore, setIsSavingStore] = useState(false);
  const [isSavingHighlight, setIsSavingHighlight] = useState(false);
  const [highlightForm, setHighlightForm] =
    useState<HighlightFormState>(emptyHighlightForm);
  const [highlightImagePreview, setHighlightImagePreview] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadWorkspace = useCallback(async () => {
    setError("");
    setIsLoading(true);

    try {
      setWorkspace(await getSellerWorkspace());
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Seller workspace could not be loaded.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const categories = useMemo(() => {
    const productCategories = (workspace?.products || []).map(
      (item) => item.category,
    );
    const serviceCategories = (workspace?.services || []).map(
      (item) => item.category,
    );

    return Array.from(new Set([...productCategories, ...serviceCategories]))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [workspace]);

  const metrics = useMemo(() => {
    const products = workspace?.products || [];
    const services = workspace?.services || [];
    const activeProducts = products.filter((item) => item.status === "active");
    const totalInventory = products.reduce(
      (total, item) => total + item.stock,
      0,
    );

    return [
      {
        label: "Active products",
        value: activeProducts.length,
        helper: `${products.length} total listings`,
        icon: <FiShoppingBag />,
        tone: "green",
      },
      {
        label: "Services",
        value: services.filter((item) => item.status === "active").length,
        helper: `${services.length} configured`,
        icon: <FiActivity />,
        tone: "blue",
      },
      {
        label: "Highlights",
        value: workspace?.highlights.length || 0,
        helper: "Seller-created profile circles",
        icon: <FiGrid />,
        tone: "purple",
      },
      {
        label: "Inventory units",
        value: totalInventory,
        helper: `${products.filter((item) => item.stock <= 3).length} low-stock items`,
        icon: <FiArchive />,
        tone: "orange",
      },
      {
        label: "Store visibility",
        value: workspace?.store.status === "active" ? "Live" : "Paused",
        helper: workspace?.store.verified
          ? "Verified seller"
          : "Verification pending",
        icon: <FiEye />,
        tone: "dark",
      },
    ];
  }, [workspace]);

  function resetHighlightForm() {
    setHighlightForm(emptyHighlightForm);
    setHighlightImagePreview("");
  }

  async function handleDelete(
    kind: "product" | "service",
    item: SellerProduct | SellerService,
  ) {
    if (!window.confirm(`Delete "${item.name}"? This cannot be undone.`)) return;

    setError("");
    setNotice("");

    try {
      if (kind === "product") {
        await deleteSellerProduct(item.id);
      } else {
        await deleteSellerService(item.id);
      }

      setNotice(`${kind === "product" ? "Product" : "Service"} deleted.`);
      await loadWorkspace();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The listing could not be deleted.",
      );
    }
  }

  async function handleStoreSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setIsSavingStore(true);

    try {
      const response = await updateSellerStore(new FormData(event.currentTarget));
      setWorkspace((current) =>
        current ? { ...current, store: response.store } : current,
      );
      setNotice("Store profile updated successfully.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Store profile could not be updated.",
      );
    } finally {
      setIsSavingStore(false);
    }
  }

  async function handleHighlightSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setIsSavingHighlight(true);

    const formData = new FormData(event.currentTarget);
    formData.set("title", highlightForm.title);
    formData.set("category", highlightForm.category);
    formData.set("sortOrder", String(highlightForm.sortOrder));

    try {
      if (highlightForm.id) {
        await updateSellerHighlight(highlightForm.id, formData);
        setNotice("Highlight updated successfully.");
      } else {
        await createSellerHighlight(formData);
        setNotice("Highlight created successfully.");
      }

      resetHighlightForm();
      await loadWorkspace();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Highlight could not be saved.",
      );
    } finally {
      setIsSavingHighlight(false);
    }
  }

  async function handleDeleteHighlight(highlight: StoreHighlight) {
    if (!window.confirm(`Delete "${highlight.title}" highlight?`)) return;

    setError("");
    setNotice("");

    try {
      await deleteSellerHighlight(highlight.id);
      setNotice("Highlight deleted.");
      await loadWorkspace();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Highlight could not be deleted.",
      );
    }
  }

  async function moveHighlight(index: number, direction: -1 | 1) {
    if (!workspace) return;

    const nextIndex = index + direction;

    if (nextIndex < 0 || nextIndex >= workspace.highlights.length) return;

    const nextHighlights = [...workspace.highlights];
    const [current] = nextHighlights.splice(index, 1);
    nextHighlights.splice(nextIndex, 0, current);

    setWorkspace({ ...workspace, highlights: nextHighlights });

    try {
      const response = await reorderSellerHighlights(
        nextHighlights.map((item) => item.id),
      );
      setWorkspace((currentWorkspace) =>
        currentWorkspace
          ? { ...currentWorkspace, highlights: response.highlights }
          : currentWorkspace,
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Highlight order could not be saved.",
      );
      await loadWorkspace();
    }
  }

  if (isLoading) {
    return (
      <section className="seller-workspace-page">
        <LoadingState
          title="Loading your seller workspace"
          message="Gleank is syncing your store, products, services, highlights, and inventory."
        />
      </section>
    );
  }

  if (!workspace) {
    return (
      <section className="seller-workspace-page">
        <div className="seller-workspace-error">
          <FiAlertCircle />
          <h1>Seller workspace unavailable</h1>
          <p>{error || "Your store could not be loaded."}</p>
          <button type="button" onClick={() => void loadWorkspace()}>
            <FiRefreshCw />
            Try again
          </button>
        </div>
      </section>
    );
  }

  const { store, products, services, highlights } = workspace;

  return (
    <section className="seller-workspace-page">
      <header className="seller-workspace-hero">
        <div>
          <span className="seller-workspace-eyebrow">Seller workspace</span>
          <h1>Run {store.name} from one clear command center.</h1>
          <p>
            Manage your public store, publish products and services, control
            inventory, and build highlight circles for buyers to browse faster.
          </p>

          <div className="seller-workspace-hero-actions">
            <Link to="/create?type=product">
              <FiPlus />
              Add product
            </Link>
            <Link to="/create?type=service" className="secondary">
              <FiBox />
              Add service
            </Link>
            <button
              type="button"
              className="secondary"
              onClick={() => setActiveTab("highlights")}
            >
              <FiGrid />
              Manage highlights
            </button>
            <Link to={`/stores/${store.slug}`} className="ghost">
              <FiEye />
              View public store
            </Link>
          </div>
        </div>

        <div className="seller-workspace-health">
          <div className="seller-workspace-health-icon">
            <FiCheckCircle />
          </div>
          <span>Store status</span>
          <strong>{store.status === "active" ? "Open" : "Paused"}</strong>
          <p>
            {store.verified
              ? "Your seller identity is verified."
              : "Your store works locally while verification remains pending."}
          </p>
          <small>{store.campus} campus</small>
        </div>
      </header>

      {(error || notice) && (
        <div
          className={`seller-workspace-message ${error ? "error" : "success"}`}
          role={error ? "alert" : "status"}
        >
          {error ? <FiAlertCircle /> : <FiCheckCircle />}
          <span>{error || notice}</span>
        </div>
      )}

      <div className="seller-workspace-tabs" role="tablist">
        {(
          [
            ["overview", "Overview", <FiBarChart2 />],
            ["products", "Products", <FiPackage />],
            ["services", "Services", <FiBox />],
            ["highlights", "Highlights", <FiGrid />],
            ["store", "Store profile", <FiEdit3 />],
          ] as const
        ).map(([value, label, icon]) => (
          <button
            type="button"
            key={value}
            className={activeTab === value ? "active" : ""}
            onClick={() => setActiveTab(value)}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <>
          <div className="seller-workspace-metrics">
            {metrics.map((metric) => (
              <article
                className={`seller-workspace-metric ${metric.tone}`}
                key={metric.label}
              >
                <div>{metric.icon}</div>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <p>{metric.helper}</p>
              </article>
            ))}
          </div>

          <div className="seller-workspace-overview-grid">
            <section className="seller-workspace-panel">
              <div className="seller-workspace-panel-header">
                <div>
                  <span>Inventory watch</span>
                  <h2>Products needing attention</h2>
                </div>
                <button type="button" onClick={() => setActiveTab("products")}>
                  View all
                </button>
              </div>

              {products.length ? (
                <CompactListingList items={products.slice(0, 5)} />
              ) : (
                <EmptyState
                  icon={<FiPackage />}
                  title="No products yet"
                  message="Create your first product to start building your store inventory."
                  actionLabel="Add product"
                  onAction={() => {
                    window.location.href = "/create?type=product";
                  }}
                />
              )}
            </section>

            <aside className="seller-workspace-panel seller-store-summary">
              <div className="seller-store-summary-cover">
                {store.coverUrl ? (
                  <img src={resolveMediaUrl(store.coverUrl, mediaFallback)} alt="" />
                ) : (
                  <FiImage />
                )}
              </div>
              <div className="seller-store-summary-logo">
                {store.logoUrl ? (
                  <img src={resolveMediaUrl(store.logoUrl, mediaFallback)} alt="" />
                ) : (
                  store.name.slice(0, 2).toUpperCase()
                )}
              </div>
              <span>@{store.slug}</span>
              <h2>{store.name}</h2>
              <p>
                {store.description ||
                  "Add a store description to help campus buyers trust your business."}
              </p>
              <div>
                <small>
                  <FiUsers /> {store.campus}
                </small>
                <small>
                  <FiShoppingBag /> {store.category}
                </small>
              </div>
              <button type="button" onClick={() => setActiveTab("store")}>
                Complete store profile
              </button>
            </aside>
          </div>
        </>
      )}

      {activeTab === "products" && (
        <ListingSection
          title="Products"
          description="Control pricing, stock, visibility, and product media."
          createPath="/create?type=product"
          emptyIcon={<FiPackage />}
          items={products}
          kind="product"
          onDelete={handleDelete}
        />
      )}

      {activeTab === "services" && (
        <ListingSection
          title="Services"
          description="Manage bookable services, duration, pricing, and availability."
          createPath="/create?type=service"
          emptyIcon={<FiBox />}
          items={services}
          kind="service"
          onDelete={handleDelete}
        />
      )}

      {activeTab === "highlights" && (
        <section className="seller-highlight-manager">
          <div className="seller-workspace-panel-header">
            <div>
              <span>Public profile circles</span>
              <h2>Seller highlights</h2>
              <p>
                Create highlight circles that appear under your seller profile
                header. Each highlight filters your products or services by the
                category you select.
              </p>
            </div>
          </div>

          <div className="seller-highlight-layout">
            <form
              className="seller-highlight-form seller-workspace-panel"
              onSubmit={handleHighlightSubmit}
            >
              <div className="seller-highlight-form-head">
                <h3>
                  {highlightForm.id ? "Edit highlight" : "Create highlight"}
                </h3>
                {highlightForm.id && (
                  <button type="button" onClick={resetHighlightForm}>
                    <FiX />
                    Cancel edit
                  </button>
                )}
              </div>

              <label>
                <span>Highlight title</span>
                <input
                  name="title"
                  value={highlightForm.title}
                  onChange={(event) =>
                    setHighlightForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  placeholder="Best Deals"
                  required
                />
              </label>

              <label>
                <span>Category to show when clicked</span>
                <input
                  name="category"
                  list="seller-highlight-categories"
                  value={highlightForm.category}
                  onChange={(event) =>
                    setHighlightForm((current) => ({
                      ...current,
                      category: event.target.value,
                    }))
                  }
                  placeholder="Food, Fashion, Services..."
                  required
                />
                <datalist id="seller-highlight-categories">
                  {categories.map((category) => (
                    <option value={category} key={category} />
                  ))}
                  <option value="Favorites" />
                </datalist>
              </label>

              <label>
                <span>Sort order</span>
                <input
                  name="sortOrder"
                  type="number"
                  min="0"
                  value={highlightForm.sortOrder}
                  onChange={(event) =>
                    setHighlightForm((current) => ({
                      ...current,
                      sortOrder: Number(event.target.value || 0),
                    }))
                  }
                />
              </label>

              {highlightImagePreview && (
                <div className="seller-highlight-preview">
                  <img
                    src={resolveMediaUrl(highlightImagePreview, mediaFallback)}
                    alt="Highlight preview"
                  />
                </div>
              )}

              <label className="seller-media-upload">
                <FiUploadCloud />
                <strong>Highlight image</strong>
                <small>Square image recommended. Leave empty to use category product image.</small>
                <input
                  name="image"
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    setHighlightImagePreview(URL.createObjectURL(file));
                  }}
                />
              </label>

              <button
                type="submit"
                className="create-submit-btn"
                disabled={isSavingHighlight}
              >
                <FiSave />
                {isSavingHighlight
                  ? "Saving..."
                  : highlightForm.id
                    ? "Save highlight"
                    : "Create highlight"}
              </button>
            </form>

            <div className="seller-highlight-list seller-workspace-panel">
              {highlights.length ? (
                highlights.map((highlight, index) => (
                  <article className="seller-highlight-row" key={highlight.id}>
                    <div className="seller-highlight-row-image">
                      {highlight.imageUrl ? (
                        <img
                          src={resolveMediaUrl(highlight.imageUrl, mediaFallback)}
                          alt={highlight.title}
                        />
                      ) : (
                        <FiGrid />
                      )}
                    </div>

                    <div>
                      <strong>{highlight.title}</strong>
                      <span>{highlight.category}</span>
                    </div>

                    <div className="seller-highlight-row-actions">
                      <button
                        type="button"
                        onClick={() => void moveHighlight(index, -1)}
                        disabled={index === 0}
                        aria-label="Move highlight up"
                      >
                        <FiArrowUp />
                      </button>
                      <button
                        type="button"
                        onClick={() => void moveHighlight(index, 1)}
                        disabled={index === highlights.length - 1}
                        aria-label="Move highlight down"
                      >
                        <FiArrowDown />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setHighlightForm({
                            id: highlight.id,
                            title: highlight.title,
                            category: highlight.category,
                            sortOrder: highlight.sortOrder || index,
                          });
                          setHighlightImagePreview(highlight.imageUrl || "");
                        }}
                        aria-label={`Edit ${highlight.title}`}
                      >
                        <FiEdit3 />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteHighlight(highlight)}
                        aria-label={`Delete ${highlight.title}`}
                      >
                        <FiTrash2 />
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <EmptyState
                  icon={<FiGrid />}
                  title="No seller highlights yet"
                  message="Create highlights so buyers can quickly browse your best categories."
                />
              )}
            </div>
          </div>
        </section>
      )}

      {activeTab === "store" && (
        <form className="seller-store-editor" onSubmit={handleStoreSubmit}>
          <div className="seller-workspace-panel-header">
            <div>
              <span>Public store</span>
              <h2>Store profile and visibility</h2>
              <p>These details appear to buyers on your public store page.</p>
            </div>
            <button type="submit" disabled={isSavingStore}>
              <FiSave />
              {isSavingStore ? "Saving..." : "Save changes"}
            </button>
          </div>

          <div className="seller-store-editor-grid">
            <label>
              <span>Store name</span>
              <input name="name" defaultValue={store.name} required />
            </label>
            <label>
              <span>Campus</span>
              <input name="campus" defaultValue={store.campus} required />
            </label>
            <label>
              <span>Business category</span>
              <input name="category" defaultValue={store.category} required />
            </label>
            <label>
              <span>Contact phone</span>
              <input name="phone" defaultValue={store.phone} />
            </label>
            <label>
              <span>Store visibility</span>
              <select name="status" defaultValue={store.status}>
                <option value="active">Open to buyers</option>
                <option value="paused">Temporarily paused</option>
              </select>
            </label>
            <label className="seller-store-editor-wide">
              <span>Store description</span>
              <textarea
                name="description"
                defaultValue={store.description}
                rows={5}
                placeholder="Tell students what your store sells and why they can trust you."
              />
            </label>
            <label className="seller-media-upload">
              <FiUploadCloud />
              <strong>Store logo</strong>
              <small>Square JPEG, PNG, WebP, or GIF. Maximum 5 MB.</small>
              <input name="logo" type="file" accept="image/*" />
            </label>
            <label className="seller-media-upload">
              <FiUploadCloud />
              <strong>Cover image</strong>
              <small>Wide image recommended. Maximum 5 MB.</small>
              <input name="cover" type="file" accept="image/*" />
            </label>
          </div>
        </form>
      )}
    </section>
  );
}

function CompactListingList({
  items,
}: {
  items: Array<SellerProduct | SellerService>;
}) {
  return (
    <div className="seller-workspace-compact-list">
      {items.map((item) => (
        <article key={item.id}>
          <div className="seller-listing-thumb">
            {item.imageUrls[0] ? (
              <img src={resolveMediaUrl(item.imageUrls[0], mediaFallback)} alt="" />
            ) : (
              <FiImage />
            )}
          </div>
          <div>
            <strong>{item.name}</strong>
            <span>{item.category}</span>
          </div>
          <p>{formatNaira(item.price)}</p>
          {"stock" in item && (
            <small className={item.stock <= 3 ? "low" : ""}>
              {item.stock} in stock
            </small>
          )}
        </article>
      ))}
    </div>
  );
}

type ListingSectionProps = {
  title: string;
  description: string;
  createPath: string;
  emptyIcon: ReactNode;
  items: Array<SellerProduct | SellerService>;
  kind: "product" | "service";
  onDelete: (
    kind: "product" | "service",
    item: SellerProduct | SellerService,
  ) => Promise<void>;
};

function ListingSection({
  title,
  description,
  createPath,
  emptyIcon,
  items,
  kind,
  onDelete,
}: ListingSectionProps) {
  return (
    <section className="seller-listing-manager">
      <div className="seller-workspace-panel-header">
        <div>
          <span>Management</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <Link to={createPath}>
          <FiPlus />
          Add {kind}
        </Link>
      </div>

      {items.length ? (
        <div className="seller-listing-table">
          {items.map((item) => (
            <article key={item.id}>
              <div className="seller-listing-thumb">
                {item.imageUrls[0] ? (
                  <img
                    src={resolveMediaUrl(item.imageUrls[0], mediaFallback)}
                    alt={item.name}
                  />
                ) : (
                  <FiImage />
                )}
              </div>
              <div className="seller-listing-primary">
                <strong>{item.name}</strong>
                <span>
                  {item.category}
                  {item.isFeatured ? " · Favorite" : ""}
                </span>
              </div>
              <div>
                <small>Price</small>
                <strong>{formatNaira(item.price)}</strong>
              </div>
              <div>
                <small>{kind === "product" ? "Inventory" : "Duration"}</small>
                <strong>
                  {"stock" in item
                    ? `${item.stock} units`
                    : `${item.durationMinutes} min`}
                </strong>
              </div>
              <span className={`seller-listing-status ${item.status}`}>
                {item.status.replaceAll("_", " ")}
              </span>
              <div className="seller-listing-actions">
                <Link
                  to={`/create?type=${kind}&id=${item.id}`}
                  aria-label={`Edit ${item.name}`}
                >
                  <FiEdit3 />
                </Link>
                <button
                  type="button"
                  onClick={() => void onDelete(kind, item)}
                  aria-label={`Delete ${item.name}`}
                >
                  <FiTrash2 />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={emptyIcon}
          title={`No ${title.toLowerCase()} yet`}
          message={`Create your first ${kind} and it will appear here.`}
          actionLabel={`Add ${kind}`}
          onAction={() => {
            window.location.href = createPath;
          }}
        />
      )}
    </section>
  );
}

export default Dashboard;
