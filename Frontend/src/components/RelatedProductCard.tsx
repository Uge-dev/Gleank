import { Link } from "react-router-dom";
import { FiShoppingCart } from "react-icons/fi";
import type { PublicProduct } from "../types/domain";
import { resolveMediaUrl } from "../utils/media";

type RelatedProductCardProps = {
  product: PublicProduct;
  onAddToCart: () => void;
  disabled?: boolean;
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
  onAddToCart,
  disabled = false,
}: RelatedProductCardProps) {
  const isAvailable =
    product.status !== "out_of_stock" && Number(product.stock || 0) > 0;

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
          {product.category} • {product.store.campus} •{" "}
          {product.status === "out_of_stock" || Number(product.stock || 0) <= 0
            ? "Out of stock"
            : `${product.stock} In stock`}
        </p>
        <strong>{formatPrice(product.price)}</strong>

        <div className="related-product-actions">
          <button
            type="button"
            className="related-add-cart-btn"
            onClick={onAddToCart}
            disabled={disabled || !isAvailable}
            aria-label={`Add ${product.name} to cart`}
          >
            <FiShoppingCart />
            <span>Add to cart</span>
          </button>
          <Link to={`/products/${product.id}`}>View</Link>
        </div>
      </div>
    </article>
  );
}

export default RelatedProductCard;
