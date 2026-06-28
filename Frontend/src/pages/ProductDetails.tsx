import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  FiArrowLeft,
  FiBookmark,
  FiCheckCircle,
  FiHeart,
  FiMessageCircle,
  FiMinus,
  FiPlus,
  FiSend,
  FiShoppingBag,
  FiShoppingCart,
  FiTruck,
} from "react-icons/fi";

import AuthModal from "../components/AuthModal";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import LoadingState from "../components/LoadingState";
import ProductMediaCarousel from "../components/ProductMediaCarousel";
import RelatedProductCard from "../components/RelatedProductCard";
import SellerStoreCard from "../components/SellerStoreCard";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useSaved } from "../context/SavedContext";
import {
  commentOnPublicProduct,
  getPublicProduct,
  likePublicProduct,
  unlikePublicProduct,
} from "../services/marketplace.service";
import {
  followPublicStore,
  unfollowPublicStore,
} from "../services/seller.service";
import type {
  ProductDetailsResponse,
  SavedItemType,
} from "../types/domain";
import { resolveMediaUrl } from "../utils/media";

const productFallback =
  "https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=1200&q=80";

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(price);
}

function ProductDetails() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { addToCart } = useCart();
  const { isSaved, toggleSaved } = useSaved();
  const [data, setData] = useState<ProductDetailsResponse | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState<"Pickup" | "Delivery">(
    "Pickup",
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [commentText, setCommentText] = useState("");
  const [isCommenting, setIsCommenting] = useState(false);
  const [shareNotice, setShareNotice] = useState("");

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError("");
    setQuantity(1);

    void getPublicProduct(id)
      .then((response) => {
        if (active) setData(response);
      })
      .catch((requestError) => {
        if (active) {
          setData(null);
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Product could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  const product = data?.product;
  const images = useMemo(
    () =>
      (product?.imageUrls.length ? product.imageUrls : [productFallback]).map(
        (image) => resolveMediaUrl(image, productFallback),
      ),
    [product],
  );

  function requireAuth(action?: () => void) {
    if (!isAuthenticated) {
      setAuthModalOpen(true);
      return false;
    }
    action?.();
    return true;
  }

  async function handleToggleSave(itemType: SavedItemType, itemId: string) {
    if (!requireAuth()) return;
    const saved = await toggleSaved(itemType, itemId);
    if (itemType === "product") {
      setData((current) =>
        current
          ? {
              ...current,
              interaction: {
                ...current.interaction,
                saveCount: Math.max(
                  0,
                  current.interaction.saveCount + (saved ? 1 : -1),
                ),
              },
            }
          : current,
      );
    }
  }

  async function handleLike() {
    if (!product || !requireAuth()) return;
    const response = data?.interaction.liked
      ? await unlikePublicProduct(product.id)
      : await likePublicProduct(product.id);
    setData((current) =>
      current
        ? { ...current, interaction: response.interaction }
        : current,
    );
  }

  async function handleFollow() {
    if (!product || !requireAuth()) return;
    const response = data?.storeInteraction.isFollowing
      ? await unfollowPublicStore(product.store.slug)
      : await followPublicStore(product.store.slug);
    setData((current) =>
      current
        ? { ...current, storeInteraction: response.interaction }
        : current,
    );
  }

  async function handleCommentSubmit() {
    if (!product || !commentText.trim() || !requireAuth()) return;
    setIsCommenting(true);
    try {
      const response = await commentOnPublicProduct(product.id, commentText);
      setData((current) =>
        current
          ? {
              ...current,
              comments: [response.comment, ...current.comments],
              interaction: {
                ...current.interaction,
                commentCount: current.interaction.commentCount + 1,
              },
            }
          : current,
      );
      setCommentText("");
    } finally {
      setIsCommenting(false);
    }
  }

  function handleAddToCart() {
    if (!product || product.status === "out_of_stock") return;
    addToCart({
      id: product.id,
      name: product.name,
      price: formatPrice(product.price),
      numericPrice: product.price,
      image: images[0],
      sellerName: product.store.name,
      sellerId: product.store.slug,
      campus: product.store.campus,
      quantity,
    });
  }

  function handleOrderNow() {
    if (!requireAuth()) return;
    handleAddToCart();
    navigate("/checkout");
  }

  async function shareProduct() {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: product?.name, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    setShareNotice("Product link copied");
    window.setTimeout(() => setShareNotice(""), 2200);
  }

  if (isLoading) {
    return (
      <section className="product-details-page">
        <LoadingState
          title="Loading product"
          message="Loading the latest product and store information."
        />
      </section>
    );
  }

  if (!product) {
    return (
      <section className="product-details-page">
        {error ? (
          <ErrorState
            title="Product failed to load"
            message={error}
            onRetry={() => window.location.reload()}
          />
        ) : (
          <EmptyState
            icon={<FiShoppingBag />}
            eyebrow="Product not found"
            title="This product is no longer available"
            message="It may have been removed, drafted, or the link is incorrect."
            actionLabel="Back to Search"
            onAction={() => navigate("/search")}
          />
        )}
        <button
          type="button"
          className="details-back-button"
          onClick={() => navigate(-1)}
        >
          <FiArrowLeft />
          Go Back
        </button>
      </section>
    );
  }

  const productSaved = isSaved("product", product.id);
  const inStock = product.status !== "out_of_stock" && product.stock > 0;
  const specs = [
    { label: "Category", value: product.category },
    { label: "Store", value: product.store.name },
    { label: "Campus", value: product.store.campus },
    { label: "Stock", value: `${product.stock} available` },
    { label: "Listing", value: product.status.replaceAll("_", " ") },
    { label: "Store status", value: product.store.status },
  ];

  return (
    <>
      <section className="product-details-page">
        <Link to="/search" className="product-back-link">
          ← Back to Market
        </Link>

        <div className="product-main-layout">
          <ProductMediaCarousel product={{ name: product.name, images }} />

          <aside className="product-buy-panel">
            <div className="product-badge-row">
              <span>{product.category}</span>
              {product.store.verified && <span>Verified Store</span>}
              <span>{inStock ? "Available" : "Out of Stock"}</span>
            </div>

            <h1>{product.name}</h1>
            <p className="product-category-line">
              {product.category} • {product.store.campus}
            </p>

            <div className="product-social-row">
              <button
                type="button"
                className={data.interaction.liked ? "active" : ""}
                onClick={() => void handleLike()}
              >
                <FiHeart fill={data.interaction.liked ? "currentColor" : "none"} />
                {data.interaction.likeCount}
              </button>
              <a href="#product-comments">
                <FiMessageCircle /> {data.interaction.commentCount}
              </a>
              <button
                type="button"
                onClick={() => void handleToggleSave("product", product.id)}
              >
                <FiBookmark fill={productSaved ? "currentColor" : "none"} />
                {data.interaction.saveCount}
              </button>
            </div>

            <div className="product-price-row">
              <strong>{formatPrice(product.price)}</strong>
              <div className="product-quantity-control">
                <button
                  type="button"
                  onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                >
                  <FiMinus />
                </button>
                <span>{quantity}</span>
                <button
                  type="button"
                  disabled={!inStock || quantity >= product.stock}
                  onClick={() =>
                    setQuantity((current) => Math.min(product.stock, current + 1))
                  }
                >
                  <FiPlus />
                </button>
              </div>
            </div>

            <div className="product-stock-row">
              <span className={product.stock <= 3 ? "low" : ""}>
                <FiCheckCircle />
                {inStock ? "Ready to order" : "Currently unavailable"}
              </span>
              <small>{product.stock} available</small>
            </div>

            <div className="product-action-grid">
              <button
                type="button"
                className="product-cart-btn"
                disabled={!inStock}
                onClick={handleAddToCart}
              >
                <FiShoppingCart />
                Add to Cart
              </button>
              <button
                type="button"
                className="product-buy-btn"
                disabled={!inStock}
                onClick={handleOrderNow}
              >
                Order Now
              </button>
            </div>

            <button
              type="button"
              className="product-message-btn"
              onClick={() =>
                requireAuth(() =>
                  navigate(
                    `/messages?seller=${encodeURIComponent(product.store.slug)}&name=${encodeURIComponent(product.store.name)}`,
                  ),
                )
              }
            >
              <FiMessageCircle />
              Message Seller
            </button>

            <div className="product-mini-actions">
              <button
                type="button"
                onClick={() => void handleToggleSave("product", product.id)}
              >
                <FiBookmark fill={productSaved ? "currentColor" : "none"} />
                {productSaved ? "Saved" : "Save"}
              </button>
              <button type="button" onClick={() => void shareProduct()}>
                <FiSend />
                Share
              </button>
            </div>
            {shareNotice && (
              <div className="product-action-notice" role="status">
                {shareNotice}
              </div>
            )}
          </aside>
        </div>

        <div className="product-lower-layout">
          <div className="product-left-column">
            <SellerStoreCard
              product={product}
              interaction={data.storeInteraction}
              onToggleFollow={() => void handleFollow()}
            />

            <section className="product-info-box">
              <h2>Description</h2>
              <p>{product.description || "No description was provided."}</p>
            </section>

            <section className="product-info-box">
              <h2>Product Information</h2>
              <div className="product-spec-grid">
                {specs.map((spec) => (
                  <div key={spec.label}>
                    <span>{spec.label}</span>
                    <strong>{spec.value}</strong>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="product-right-column">
            <section className="product-info-box delivery-box">
              <h2>
                <FiTruck />
                Delivery & Pickup
              </h2>
              <p>Confirm the exact handover arrangement with the seller.</p>
              <div className="delivery-toggle">
                <button
                  type="button"
                  className={deliveryMode === "Pickup" ? "active" : ""}
                  onClick={() => setDeliveryMode("Pickup")}
                >
                  Pickup
                </button>
                <button
                  type="button"
                  className={deliveryMode === "Delivery" ? "active" : ""}
                  onClick={() => setDeliveryMode("Delivery")}
                >
                  Delivery
                </button>
              </div>
              <div className="delivery-details">
                <span>Campus</span>
                <strong>{product.store.campus}</strong>
                <span>Selected option</span>
                <strong>{deliveryMode}</strong>
                <span>Seller contact</span>
                <strong>{product.store.phone || "Message seller"}</strong>
              </div>
            </section>

            <section
              className="product-info-box comment-box"
              id="product-comments"
            >
              <h2>Comments</h2>
              <div className="comment-list">
                {data.comments.length ? (
                  data.comments.map((comment) => (
                    <div key={comment.id}>
                      <strong>{comment.user.name}</strong>
                      <p>{comment.body}</p>
                      <small>
                        {new Date(comment.createdAt).toLocaleDateString()}
                      </small>
                    </div>
                  ))
                ) : (
                  <p>No comments yet. Start the conversation.</p>
                )}
              </div>
              <div className="product-comment-form">
                <textarea
                  value={commentText}
                  onChange={(event) => setCommentText(event.target.value)}
                  placeholder="Ask about this product..."
                  maxLength={500}
                  rows={3}
                />
                <button
                  type="button"
                  onClick={() => void handleCommentSubmit()}
                  disabled={isCommenting || !commentText.trim()}
                >
                  {isCommenting ? "Posting..." : "Post Comment"}
                </button>
              </div>
            </section>
          </aside>
        </div>

        {data.relatedProducts.length > 0 && (
          <section className="related-products-section">
            <div className="related-products-header">
              <div>
                <span>More to discover</span>
                <h2>Related products around campus</h2>
              </div>
              <Link to="/search">Explore more</Link>
            </div>

            <div className="related-products-grid">
              {data.relatedProducts.map((relatedProduct) => (
                <RelatedProductCard
                  key={relatedProduct.id}
                  product={relatedProduct}
                  saved={isSaved("product", relatedProduct.id)}
                  onToggleSave={() =>
                    void handleToggleSave("product", relatedProduct.id)
                  }
                />
              ))}
            </div>
          </section>
        )}
      </section>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />
    </>
  );
}

export default ProductDetails;
