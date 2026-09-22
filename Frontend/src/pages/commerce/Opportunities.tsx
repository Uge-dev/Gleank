import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../../lib/api';
import { resolveMediaUrl } from '../../utils/media';
import EarningActions from '../../components/EarningActions';
import './Commerce.css';
type Opportunity = {
    id: string;
    name: string;
    price: number;
    storeName: string;
    imageUrl: string;
    dropshipMargin: number;
    commissionPercent: number;
};
export default function Opportunities() {
    const [params] = useSearchParams();
    const [mode, setMode] = useState<'dropshipping' | 'marketing'>(params.get('mode') === 'marketing' ? 'marketing' : 'dropshipping'), [products, setProducts] = useState<Opportunity[]>([]), [error, setError] = useState(''), [loading, setLoading] = useState(true);
    const load = () => { setLoading(true); setError(''); apiRequest<{
        products: Opportunity[];
    }>('/earning/opportunities').then(r => setProducts(r.products)).catch(e => setError(e.message)).finally(() => setLoading(false)); };
    useEffect(load, []);
    const eligible = products.filter(p => mode === 'dropshipping' ? p.dropshipMargin > 0 : p.commissionPercent > 0);
    return <section className="commerce-page"><span className="commerce-eyebrow">One account · Three ways to earn</span><h1>What would you like to do?</h1>
    <div className="commerce-actions"><button className={mode === 'dropshipping' ? 'primary' : ''} onClick={() => setMode('dropshipping')}>Dropship products</button><button className={mode === 'marketing' ? 'primary' : ''} onClick={() => setMode('marketing')}>Promote & earn</button><Link className="commerce-action" to="/my-products">Sell my own products</Link></div>
    <article className="commerce-card"><h2>{mode === 'dropshipping' ? 'Sell without holding stock' : 'Recommend products you love'}</h2><ol><li>Choose a product whose owner has enabled {mode === 'dropshipping' ? 'an agreed margin' : 'commission'}.</li><li>Open its earning options, accept the terms, and reshare to your public feed.</li><li>Share your personal earning link. Purchases must come through that link.</li><li>The owner delivers; the buyer confirms receipt. Track your held and released earnings.</li></ol><p>You do not need another login, shop, or seller setup. The buyer price stays the same: dropshipping earns the owner’s fixed margin, marketing earns a percentage. Ordinary shares and video tags do not create commission.</p><Link to="/earnings">View my earnings</Link> · <Link to="/create-video">Create a video</Link></article>
    {loading && <p role="status">Loading opportunities…</p>}{error && <p role="alert">{error}<button onClick={load}>Retry</button></p>}{!loading && !error && !eligible.length && <div className="commerce-card"><h2>No eligible products yet</h2><p>Product owners must opt in and set earning terms first. If you own products, enable rewards under My products.</p><Link to="/my-products">Manage my products</Link></div>}
    {eligible.map(p => <article className="commerce-card" key={p.id}>{p.imageUrl && <img src={resolveMediaUrl(p.imageUrl, '')} alt={p.name} loading="lazy" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 12 }}/>}<h2><Link to={'/products/' + p.id}>{p.name}</Link></h2><p>{p.storeName} · ₦{p.price.toLocaleString()}</p><EarningActions productId={p.id} initialMode={mode}/></article>)}
  </section>;
}
