import { Link } from "react-router-dom";
import { FiHeart, FiShoppingCart } from "react-icons/fi";
import type { SearchProduct } from "../data/searchData";


type SearchProductCardProps = {
  product: SearchProduct;
  onRequireAuth: () => void;
};

function SearchProductCard({ product, onRequireAuth }: SearchProductCardProps) {
  return (
    <article className="search-product-card">
      <div className="search-product-image">
        <img src={product.image} alt={product.name} />
        <span>{product.tag}</span>
      </div>

      <div className="search-product-body">
        <h3>{product.name}</h3>

        <p>
          {product.category} • {product.campus}
        </p>

       <Link to={`/stores/${product.sellerId}`} className="seller-name-link">
  {product.seller}
</Link>

        <div className="search-product-stats">
          <strong>{product.price}</strong>

          <span>
            <FiHeart />
            {product.likes}
          </span>
        </div>

        <div className="search-product-actions">
          <button onClick={onRequireAuth}>
            <FiShoppingCart />
          </button>

          <Link to={`/products/${product.id}`}>View Product</Link>
        </div>
      </div>
    </article>
  );
}

export default SearchProductCard;