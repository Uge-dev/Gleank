import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  FiShoppingCart,
  FiVolume2,
  FiVolumeX,
  FiPlayCircle,
} from "react-icons/fi";

type ProductCardProps = {
  id: string;
  name: string;
  price: string;
  category: string;
  campus: string;
  seller: string;
  mediaType: "image" | "video";
  imageUrl?: string;
  videoUrl?: string;
  tag?: string;
  onRequireAuth: () => void;
};

function ProductCard({
  id,
  name,
  price,
  category,
  campus,
  seller,
  mediaType,
  imageUrl,
  videoUrl,
  tag,
  onRequireAuth,
}: ProductCardProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = useState(true);

  function toggleSound() {
    if (!videoRef.current) return;

    const nextMutedState = !muted;
    videoRef.current.muted = nextMutedState;
    setMuted(nextMutedState);
  }

  return (
    <article className="explore-product-card">
      <div className="explore-product-media">
        {mediaType === "video" && videoUrl ? (
          <>
            <video
              ref={videoRef}
              src={videoUrl}
              muted
              autoPlay
              loop
              playsInline
            />

            <button
              className="video-sound-btn"
              onClick={toggleSound}
              aria-label="Toggle video sound"
            >
              {muted ? <FiVolumeX /> : <FiVolume2 />}
            </button>

            <span className="video-tag">
              <FiPlayCircle />
              Reel
            </span>
          </>
        ) : (
          <img src={imageUrl} alt={name} />
        )}

        {tag && <span className="product-tag">{tag}</span>}
      </div>

      <div className="explore-product-body">
        <h3>{name}</h3>

        <p>
          {category} • {campus}
        </p>

        <small>{seller}</small>

        <div className="explore-price-row">
          <strong>{price}</strong>
        </div>

        <div className="explore-card-actions">
          <button className="explore-cart-btn" onClick={onRequireAuth}>
            <FiShoppingCart />
          </button>

          <Link to={`/products/${id}`} className="explore-view-btn">
            View Product
          </Link>
        </div>
      </div>
    </article>
  );
}

export default ProductCard;