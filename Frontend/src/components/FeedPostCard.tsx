import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  FiBookmark,
  FiChevronLeft,
  FiChevronRight,
  FiEye,
  FiHeart,
  FiMessageCircle,
  FiMinus,
  FiPlus,
  FiSend,
  FiShoppingCart,
} from "react-icons/fi";

import { getStorePath } from "../utils/storeLinks";
import { useCart } from "../context/CartContext";
import { parseNairaPrice } from "../utils/price";

type FeedPostCardProps = {
  id: string;
  storeName: string;
  username: string;
  campus: string;
  storeLogoUrl?: string | null;
  productName: string;
  price: string;
  category: string;
  images: string[];
  badgeText?: string;
  likeCount?: number;
  commentCount?: number;
  shareCount?: number;
  viewCount?: number;
  onRequireAuth: () => void;
  productSaved?: boolean;
  productLiked?: boolean;
  storeFollowing?: boolean;
  onToggleProductSave?: () => void;
  onToggleStoreFollow?: () => void;
  onToggleLike?: () => void;
  onComment?: () => void;
  onShare?: () => void;
onViewed?: () => void;
maxQuantity?: number;
};

function compactNumber(value: number) {
  if (value >= 1_000_000) {
    const formatted = value / 1_000_000;
    return `${Number.isInteger(formatted) ? formatted.toFixed(0) : formatted.toFixed(1)}M`;
  }

  if (value >= 1_000) {
    const formatted = value / 1_000;
    return `${Number.isInteger(formatted) ? formatted.toFixed(0) : formatted.toFixed(1)}k`;
  }

  return String(value);
}

function getSellerInitials(name: string) {
  const words = name.trim().split(" ").filter(Boolean);

  if (words.length === 0) return "G";

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return words
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase();
}

function FeedPostCard({
  id,
  storeName,
  username,
  campus,
  storeLogoUrl,
  productName,
  price,
  category,
  images,
  badgeText,
  likeCount = 0,
  commentCount = 0,
  shareCount = 0,
  viewCount = 0,
  onRequireAuth,
  productSaved = false,
  productLiked = false,
  storeFollowing = false,
  onToggleProductSave,
  onToggleStoreFollow,
  onToggleLike,
  onComment,
  onShare,
onViewed,
maxQuantity,
}: FeedPostCardProps) {
  const [activeImage, setActiveImage] = useState(0);
  const [quantity, setQuantity] = useState(1);

  const cardRef = useRef<HTMLElement | null>(null);
const sliderRef = useRef<HTMLDivElement | null>(null);
const viewRecordedRef = useRef(false);
const viewTimerRef = useRef<number | null>(null);

const { addToCart } = useCart();

  const safeImages = images.filter(Boolean);
  const storePath = getStorePath(username);
  const sellerInitials = getSellerInitials(storeName);

  function scrollToImage(index: number) {
    if (!sliderRef.current) return;

    const sliderWidth = sliderRef.current.clientWidth;

    sliderRef.current.scrollTo({
      left: sliderWidth * index,
      behavior: "smooth",
    });

    setActiveImage(index);
  }

  function goToPreviousImage() {
    const previousIndex =
      activeImage === 0 ? safeImages.length - 1 : activeImage - 1;

    scrollToImage(previousIndex);
  }

  function goToNextImage() {
    const nextIndex =
      activeImage === safeImages.length - 1 ? 0 : activeImage + 1;

    scrollToImage(nextIndex);
  }

  function handleImageScroll() {
    if (!sliderRef.current) return;

    const sliderWidth = sliderRef.current.clientWidth;
    const currentIndex = Math.round(sliderRef.current.scrollLeft / sliderWidth);

    setActiveImage(currentIndex);
  }

  function handleAddToCart() {
    if (maxQuantity === 0) return;

    addToCart({
      id,
      name: productName,
      price,
      numericPrice: parseNairaPrice(price),
      image: safeImages[0],
      sellerName: storeName,
      sellerId: username,
      campus,
      quantity,
    });
  }

  function increaseQuantity() {
    setQuantity((currentQuantity) =>
      maxQuantity !== undefined
        ? Math.min(maxQuantity, currentQuantity + 1)
        : currentQuantity + 1,
    );
  }

  function decreaseQuantity() {
    setQuantity((currentQuantity) => {
      if (currentQuantity <= 1) return 1;
      return currentQuantity - 1;
    });
  }

  useEffect(() => {
  if (!onViewed || viewRecordedRef.current) return;

  const card = cardRef.current;

  if (!card || typeof IntersectionObserver === "undefined") return;

  const observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];

      if (!entry) return;

      if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
        if (viewTimerRef.current) {
          window.clearTimeout(viewTimerRef.current);
        }

        viewTimerRef.current = window.setTimeout(() => {
          if (viewRecordedRef.current) return;

          viewRecordedRef.current = true;
          onViewed();
          observer.disconnect();
        }, 700);
      } else if (viewTimerRef.current) {
        window.clearTimeout(viewTimerRef.current);
        viewTimerRef.current = null;
      }
    },
    {
      threshold: [0.25, 0.55, 0.75],
    },
  );

  observer.observe(card);

  return () => {
    observer.disconnect();

    if (viewTimerRef.current) {
      window.clearTimeout(viewTimerRef.current);
      viewTimerRef.current = null;
    }
  };
}, [onViewed]);

  return (
    <article className="feed-card" ref={cardRef}>
      <div className="feed-card-header">
        <Link to={storePath} className="feed-store-link">
          <div className="feed-store-avatar">
            {storeLogoUrl ? (
              <img src={storeLogoUrl} alt={storeName} />
            ) : (
              sellerInitials
            )}
          </div>

          <div>
            <h3>{storeName}</h3>
            <p>
              @{username} • {campus}
            </p>
          </div>
        </Link>

        <button
          type="button"
          className="feed-follow-btn"
          onClick={onToggleStoreFollow || onRequireAuth}
        >
          {storeFollowing ? "Following" : "Follow"}
        </button>
      </div>

      <div className="feed-media-shell">
        <div
          className="feed-media-slider"
          ref={sliderRef}
          onScroll={handleImageScroll}
        >
          {safeImages.map((image, index) => (
            <div className="feed-media-slide" key={`${id}-${image}-${index}`}>
              <img src={image} alt={`${productName} image ${index + 1}`} />

              {badgeText && index === 0 && (
                <span className="feed-media-badge">{badgeText}</span>
              )}

              {index === 0 && (
                <span className="feed-view-badge">
                  <FiEye />
                  {compactNumber(viewCount)} views
                </span>
              )}
            </div>
          ))}
        </div>

        {safeImages.length > 1 && (
          <>
            <button
              type="button"
              className="image-arrow image-arrow-left"
              onClick={goToPreviousImage}
              aria-label="Previous product image"
            >
              <FiChevronLeft />
            </button>

            <button
              type="button"
              className="image-arrow image-arrow-right"
              onClick={goToNextImage}
              aria-label="Next product image"
            >
              <FiChevronRight />
            </button>

            <div className="image-dots">
              {safeImages.map((_, index) => (
                <button
                  type="button"
                  key={index}
                  className={
                    index === activeImage ? "image-dot active" : "image-dot"
                  }
                  onClick={() => scrollToImage(index)}
                  aria-label={`Go to image ${index + 1}`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="feed-actions">
        <button
          type="button"
          onClick={onToggleLike || onRequireAuth}
          aria-label="Like product"
          className={productLiked ? "active" : ""}
        >
          <FiHeart fill={productLiked ? "currentColor" : "none"} />
          <span>{compactNumber(likeCount)}</span>
        </button>

        <button
          type="button"
          onClick={onComment || onRequireAuth}
          aria-label="Comment on product"
        >
          <FiMessageCircle />
          <span>{compactNumber(commentCount)}</span>
        </button>

        <button
          type="button"
          onClick={onShare || onRequireAuth}
          aria-label="Share product"
        >
          <FiSend />
          <span>{compactNumber(shareCount)}</span>
        </button>

        <button
          type="button"
          onClick={onToggleProductSave || onRequireAuth}
          aria-label="Save product"
          className={productSaved ? "active" : ""}
        >
          <FiBookmark fill={productSaved ? "currentColor" : "none"} />
        </button>
      </div>

      <div className="feed-info">
        <div>
          <h4>{productName}</h4>

          <p>
            {category} • {campus}
          </p>
        </div>

        <div className="price-quantity-row">
          <strong>{price}</strong>

          <div className="quantity-control">
            <button
              type="button"
              onClick={decreaseQuantity}
              aria-label="Reduce quantity"
            >
              <FiMinus />
            </button>

            <span>{quantity}</span>

            <button
              type="button"
              onClick={increaseQuantity}
              aria-label="Increase quantity"
            >
              <FiPlus />
            </button>
          </div>
        </div>
      </div>

      <div className="product-card-buttons">
        <button
          type="button"
          className="add-cart-btn"
          onClick={handleAddToCart}
          disabled={maxQuantity === 0}
        >
          <FiShoppingCart />
        </button>

        <Link to={`/products/${id}`} className="view-details-btn">
          View Details
        </Link>
      </div>
    </article>
  );
}

export default FeedPostCard;