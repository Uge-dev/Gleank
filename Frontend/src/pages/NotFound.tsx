import { Link } from "react-router-dom";
import {
  FiArrowLeft,
  FiCompass,
  FiHome,
  FiSearch,
  FiShoppingBag,
} from "react-icons/fi";

function NotFound() {
  return (
    <section className="not-found-page">
      <div className="not-found-glow glow-one"></div>
      <div className="not-found-glow glow-two"></div>

      <div className="not-found-card">
        <div className="not-found-code">
          <span>4</span>

          <div>
            <FiCompass />
          </div>

          <span>4</span>
        </div>

        <span className="not-found-eyebrow">Page not found</span>

        <h1>This page wandered away from campus.</h1>

        <p>
          The page you are trying to open does not exist, has been moved, or the
          link is incorrect.
        </p>

        <div className="not-found-actions">
          <Link to="/">
            <FiHome />
            Go Home
          </Link>

          <Link to="/search">
            <FiSearch />
            Search Gleank
          </Link>

          <button onClick={() => window.history.back()}>
            <FiArrowLeft />
            Go Back
          </button>
        </div>

        <div className="not-found-suggestions">
          <Link to="/used-market">
            <FiShoppingBag />
            Visit Used Market
          </Link>

          <Link to="/reels">
            Watch Reels
          </Link>

          <Link to="/dashboard">
            Seller Dashboard
          </Link>
        </div>
      </div>
    </section>
  );
}

export default NotFound;