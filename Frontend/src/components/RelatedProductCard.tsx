import { Link } from "react-router-dom";
import { FiBookmark } from "react-icons/fi";
import type { PublicProduct } from "../types/domain";
import { resolveMediaUrl } from "../utils/media";

type RelatedProductCardProps = {
  product: PublicProduct;
  saved: boolean;
  onToggleSave: () => void;
};

const productFallback =
  "https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=900&q=80";

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(price);
}

function RelatedProductCard({
  product,
  saved,
  onToggleSave,
}: RelatedProductCardProps) {
  return (
    <article className="related-product-card">
      <div className="related-product-image">
        <img
          src={resolveMediaUrl(product.imageUrls[0], productFallback)}
          alt={product.name}
        />
      </div>

      <div className="related-product-body">
        <h3>{product.name}</h3>
        <p>
          {product.category} • {product.store.campus}
        </p>
        <strong>{formatPrice(product.price)}</strong>

        <div className="related-product-actions">
          <button type="button" onClick={onToggleSave} aria-label="Save product">
            <FiBookmark fill={saved ? "currentColor" : "none"} />
          </button>
          <Link to={`/products/${product.id}`}>View</Link>
        </div>
      </div>
    </article>
  );
}

export default RelatedProductCard;
