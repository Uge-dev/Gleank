import { Link } from 'react-router-dom';
import './Commerce.css';
export default function CreateHub() {
    return <section className="commerce-page"><span className="commerce-eyebrow">Create on Gleenc</span><h1>What would you like to share?</h1><p>One profile for your videos, products and earning shares. Choose an activity to get started.</p><div className="commerce-grid">
    <Link className="commerce-card" to="/create-video"><h2>Post a video</h2><p>Share a demo or review with the community. Add a product tag for shopping.</p></Link>
    <Link className="commerce-card" to="/my-products"><h2>Sell my own product</h2><p>List stock you own. You manage availability and delivery.</p></Link>
    <Link className="commerce-card" to="/opportunities?mode=dropshipping"><h2>Dropship a product</h2><p>Reshare an eligible supplier product and earn the agreed margin. The supplier delivers.</p></Link>
    <Link className="commerce-card" to="/opportunities?mode=marketing"><h2>Promote & earn</h2><p>Recommend an eligible product with your earning link and receive a commission.</p></Link>
  </div></section>;
}
