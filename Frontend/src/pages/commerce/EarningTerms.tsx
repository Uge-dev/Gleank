import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiRequest } from '../../lib/api';
import './Commerce.css';
export default function EarningTerms() {
    const { id } = useParams();
    const [offer, setOffer] = useState<{
        dropshipMargin: number;
        commissionPercent: number;
    } | null>(null), [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
    useEffect(() => { apiRequest<{
        offer: typeof offer;
    }>('/earning/offers/' + id).then(r => setOffer(r.offer)).catch(e => setError(e.message)); }, [id]);
    return <section className="commerce-page"><h1>Let others sell and promote</h1><p>You keep ownership, stock control and delivery responsibility. Rewards come out of your selling proceeds, not the delivery charge or Gleenc’s fee. Only one reward applies to each purchase.</p>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}{offer && <form className="commerce-card" onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); setBusy(true); setError(''); setMessage(''); try {
            await apiRequest('/earning/offers/' + id, { method: 'PUT', body: JSON.stringify({ dropshipMargin: Number(f.get('margin')), commissionPercent: Number(f.get('percent')) }) });
            setMessage('Terms saved. Existing links must be recreated for future purchases; already placed orders keep their agreed terms.');
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save.');
        }
        finally {
            setBusy(false);
        } }}>
      <label>Dropshipping margin per unit (₦) · 0 disables<input name="margin" type="number" min={0} step="0.01" defaultValue={offer.dropshipMargin} required/></label>
      <label>Marketing commission (% of your selling price) · 0 disables<input name="percent" type="number" min={0} max={90} step="0.01" defaultValue={offer.commissionPercent} required/></label>
      <label><input type="checkbox" required/> I authorize these rewards to be deducted from my proceeds on qualifying purchases.</label><button className="primary" disabled={busy}>Save earning terms</button></form>}
    <Link to="/my-products">Back to my products</Link></section>;
}
