import { Link } from "react-router-dom";
import { FiMessageCircle, FiShield, FiZap } from "react-icons/fi";
import type { UsedProduct } from "../data/usedProducts";

type UsedProductCardProps = {
  product: UsedProduct;
  onRequireAuth: () => void;
};

function UsedProductCard({ product, onRequireAuth }: UsedProductCardProps) {
  return (
    <article className="used-product-card">
      <div className="used-product-image">
        <img src={product.image} alt={product.name} />

        <div className="used-card-badges">
          <span className="verified-used-badge">
            <FiShield /> {product.status}
          </span>

          {product.urgent && (
            <span className="urgent-used-badge">
              <FiZap /> Urgent
            </span>
          )}
        </div>
      </div>

      <div className="used-product-body">
        <div className="used-product-top">
          <h3>{product.name}</h3>
          <strong>{product.price}</strong>
        </div>

        <p>
          {product.category} • {product.campus}
        </p>

        <div className="used-condition-row">
          <span>{product.condition}</span>
          <small>{product.delivery}</small>
        </div>

        <div className="used-seller-row">
          <div className="used-seller-avatar">{product.seller.charAt(0)}</div>

          <div>
            <h4>{product.seller}</h4>
            <p>@{product.sellerUsername}</p>
          </div>
        </div>

        <div className="used-card-actions">
          <button onClick={onRequireAuth}>
            <FiMessageCircle />
          </button>

          <Link to={`/used-market/${product.id}`}>View Details</Link>
        </div>
      </div>
    </article>
  );
}

export default UsedProductCard;