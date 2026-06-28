import { Link } from "react-router-dom";
import { FiExternalLink, FiHeart, FiPackage, FiUsers } from "react-icons/fi";
import type { PublicProduct, StoreInteraction } from "../types/domain";
import { resolveMediaUrl } from "../utils/media";

type SellerStoreCardProps = {
  product: PublicProduct;
  interaction: StoreInteraction;
  onToggleFollow: () => void;
};

const storeFallback =
  "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=300&q=80";

function compactNumber(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function SellerStoreCard({
  product,
  interaction,
  onToggleFollow,
}: SellerStoreCardProps) {
  const { store } = product;

  return (
    <section className="seller-store-card">
      <div className="seller-store-top">
        <img
          className="seller-store-avatar"
          src={resolveMediaUrl(store.logoUrl, storeFallback)}
          alt={store.name}
        />

        <div>
          <h2>{store.name}</h2>
          <p>@{store.slug}</p>
          <span>
            {store.campus} • {store.verified ? "Verified store" : "Campus store"}
          </span>
        </div>
      </div>

      <div className="seller-store-stats">
        <div>
          <FiUsers />
          <strong>{compactNumber(interaction.followerCount)}</strong>
          <span>Followers</span>
        </div>
        <div>
          <FiHeart />
          <strong>{compactNumber(interaction.likesCount)}</strong>
          <span>Likes</span>
        </div>
        <div>
          <FiPackage />
          <strong>{product.stock}</strong>
          <span>Available</span>
        </div>
      </div>

      <div className="seller-store-actions">
        <button type="button" onClick={onToggleFollow}>
          {interaction.isFollowing ? "Following" : "Follow Store"}
        </button>
        <Link to={`/stores/${store.slug}`}>
          Visit Store
          <FiExternalLink />
        </Link>
      </div>
    </section>
  );
}

export default SellerStoreCard;
