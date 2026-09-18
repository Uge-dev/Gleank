import { Link } from "react-router-dom";
import "./Commerce.css";
export default function Opportunities() {
  return (
    <section className="commerce-page">
      <span className="commerce-eyebrow">
        One account · Three possibilities
      </span>
      <h1>Build your business on Gleenc</h1>
      <div className="commerce-grid">
        <article className="commerce-card">
          <h2>Sell your products</h2>
          <p>
            List products you own, set delivery terms, and fulfill paid orders.
            Your buyers confirm receipt before settlement.
          </p>
          <Link to="/selling-settings">Set up selling</Link>
        </article>
        <article className="commerce-card">
          <h2>Dropshipping</h2>
          <p>
            Offer a supplier’s products without holding stock. Supplier
            permissions and margin agreements will be required before you can
            accept orders.
          </p>
          <p>Supplier-linked offers are not available in this release.</p>
        </article>
        <article className="commerce-card">
          <h2>Digital marketing</h2>
          <p>
            Discover and share products through Gleenc’s social experience. Paid
            promotion requires an eligible product and a commission agreement.
          </p>
          <p>Commission tracking is not available in this release.</p>
          <Link to="/search">Explore products</Link>
        </article>
      </div>
    </section>
  );
}
