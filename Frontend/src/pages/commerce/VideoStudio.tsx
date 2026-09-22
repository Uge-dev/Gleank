import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { social } from '../../services/social.service';
import { searchMarketplace } from '../../services/search.service';
import type { SearchResults } from '../../types/domain';
import './Commerce.css';
export default function VideoStudio() {
    const navigate = useNavigate();
    const [busy, setBusy] = useState(false), [error, setError] = useState('');
    const [products, setProducts] = useState<SearchResults['products']>([]);
    const [preview, setPreview] = useState('');
    useEffect(() => { searchMarketplace('').then(r => setProducts(r.products)).catch(() => setError('Products could not load. You can still post an untagged video.')); }, []);
    useEffect(() => () => { if (preview)
        URL.revokeObjectURL(preview); }, [preview]);
    return <section className="commerce-page"><span className="commerce-eyebrow">Create · Share your story</span><h1>Post a video</h1><p>Show a product, share a review, or introduce yourself. Your video appears in the home feed, newest first. Tagging a product alone does not earn commission.</p>
    <form className="commerce-card" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setError(''); try {
        await social.upload(new FormData(e.currentTarget));
        navigate('/');
    }
    catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed.');
    }
    finally {
        setBusy(false);
    } }}>
      <label>Video · MP4 or WebM, up to 30 MB<input name="video" type="file" accept="video/mp4,video/webm" required disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (f && f.size > 30 * 1024 * 1024) {
        setError('Choose a video smaller than 30 MB.');
        e.target.value = '';
        setPreview('');
        return;
    } setError(''); setPreview(f ? URL.createObjectURL(f) : ''); }}/></label>
      {preview && <video src={preview} controls playsInline style={{ width: '100%', maxHeight: 360 }}/>}
      <label>Caption<textarea name="caption" required maxLength={2000} disabled={busy}/></label>
      <label>Tag a product (optional)<select name="productId" disabled={busy}><option value="">No product</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      {error && <p role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy ? 'Uploading video…' : 'Publish video'}</button>
    </form><p><Link to="/my-products">List a product</Link> · <Link to="/opportunities">Dropship or promote products</Link></p></section>;
}
