import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import './SocialCommerce.css';
type Offer = {
    ownerId: string;
    dropshipMargin: number;
    commissionPercent: number;
    commissionPerUnit: number;
};
export default function EarningActions({ productId, initialMode = 'marketing' }: {
    productId: string;
    initialMode?: 'dropshipping' | 'marketing';
}) {
    const { user } = useAuth();
    const [offer, setOffer] = useState<Offer | null>(null), [error, setError] = useState(''), [link, setLink] = useState(''), [busy, setBusy] = useState(false);
    const [mode, setMode] = useState(initialMode);
    useEffect(() => { setMode(initialMode); }, [initialMode]);
    useEffect(() => { setLink(''); setOffer(null); apiRequest<{
        offer: Offer;
    }>('/earning/offers/' + productId).then(r => setOffer(r.offer)).catch(e => setError(e.message)); }, [productId]);
    if (!offer)
        return error ? <p role="alert">{error}</p> : null;
    if (offer.ownerId === user?.id)
        return <p><Link to={'/earning-terms/' + productId}>Set dropshipping and marketing rewards</Link></p>;
    if (!offer.dropshipMargin && !offer.commissionPercent)
        return <p>This seller has not enabled earning shares for this product.</p>;
    return <section className="commerce-card"><h3>Share to your feed & earn</h3><p>The product owner supplies and delivers this item. Earnings stay held until paid delivery is confirmed and settlement checks pass.</p>
    {!user ? <Link to="/login">Sign in to get your earning link</Link> : <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); setError(''); try {
            const r = await apiRequest<{
                path: string;
            }>('/earning/offers/' + productId + '/share', { method: 'POST', body: JSON.stringify({ mode, acceptTerms: true, caption: new FormData(e.currentTarget).get('caption') }) });
            setLink(new URL(r.path, window.location.origin).href);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Could not share.');
        }
        finally {
            setBusy(false);
        } }}>
      <label>How do you want to earn?<select value={mode} onChange={e => setMode(e.target.value as typeof mode)}><option value="marketing">Digital marketing</option><option value="dropshipping">Dropshipping</option></select></label>
      <p>{mode === 'dropshipping' ? `Agreed margin: ₦${offer.dropshipMargin.toLocaleString()} per unit. No stock purchase or separate shop needed.` : `Commission: ${offer.commissionPercent}% of the owner’s selling price (currently ₦${offer.commissionPerUnit.toLocaleString()} per unit).`}</p>
      <label>Your caption<textarea name="caption" maxLength={2000} placeholder="Tell people why you recommend this product"/></label>
      <label><input type="checkbox" required/> I accept these terms: one earning share per product purchase, no self-referrals, refunds/disputes can block earnings. The reward is funded from the owner’s proceeds; the buyer price stays unchanged.</label>
      <button className="commerce-action primary" disabled={busy || (mode === 'marketing' ? !offer.commissionPercent : !offer.dropshipMargin)}>{busy ? 'Sharing…' : 'Reshare & create earning link'}</button>
    </form>}
    {error && <p role="alert">{error}</p>}{link && <div role="status"><p>Shared to your public feed. Copy this link to promote it outside Gleenc:</p><input aria-label="Your earning link" readOnly value={link} onFocus={e => e.target.select()}/><p><Link to={'/community/' + user?.id}>View my feed</Link> · <Link to="/earnings">Track earnings</Link></p></div>}
  </section>;
}
