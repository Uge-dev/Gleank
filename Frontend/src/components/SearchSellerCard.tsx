import { Link } from "react-router-dom";
import { FiHeart, FiPackage, FiUsers } from "react-icons/fi";
import type { SearchSeller } from "../data/searchData";

type SearchSellerCardProps = {
  seller: SearchSeller;
  onRequireAuth: () => void;
};

function SearchSellerCard({ seller, onRequireAuth }: SearchSellerCardProps) {
  return (
    <article className="search-seller-card">
      <div className="search-seller-cover">
        <img src={seller.cover} alt={seller.storeName} />

        {seller.isNew && <span>New Vendor</span>}
      </div>

      <div className="search-seller-body">
        <div className="search-seller-top">
          <div className="search-seller-avatar">{seller.avatar}</div>

          <div>
            <h3>{seller.storeName}</h3>
            <p>@{seller.username}</p>
            <small>
              {seller.category} • {seller.campus}
            </small>
          </div>
        </div>

        <div className="search-seller-stats">
          <span>
            <FiUsers />
            {seller.followers}
          </span>

          <span>
            <FiHeart />
            {seller.likes}
          </span>

          <span>
            <FiPackage />
            {seller.products}
          </span>
        </div>

        <div className="search-seller-actions">
          <button onClick={onRequireAuth}>Follow</button>

          <Link to={`/stores/${seller.id}`}>Visit Store</Link>
        </div>
      </div>
    </article>
  );
}

export default SearchSellerCard;