import { Link } from "react-router-dom";
import { FiMessageCircle, FiStar } from "react-icons/fi";
import type { SearchService } from "../data/searchData";

type SearchServiceCardProps = {
  service: SearchService;
  onRequireAuth: () => void;
};

function SearchServiceCard({ service, onRequireAuth }: SearchServiceCardProps) {
  return (
    <article className="search-service-card">
      <div className="search-service-image">
        <img src={service.image} alt={service.title} />

        <span>
          <FiStar />
          {service.rating}
        </span>
      </div>

      <div className="search-service-body">
        <h3>{service.title}</h3>

        <p>
          {service.category} • {service.campus}
        </p>

        <small>{service.seller}</small>

        <strong>{service.price}</strong>

        <div className="search-service-actions">
          <button onClick={onRequireAuth}>
            <FiMessageCircle />
          </button>

          <Link to={`/services/${service.id}`}>View Service</Link>
        </div>
      </div>
    </article>
  );
}

export default SearchServiceCard;