import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import FeedTopTabs from '../components/FeedTopTabs';
import AuthModal from '../components/AuthModal';
import ReelCard from '../components/ReelCard';
import { useAuth } from '../context/AuthContext';
import { social, type SocialPost } from '../services/social.service';
import { searchMarketplace } from '../services/search.service';
import type { SearchResults } from '../types/domain';
import { resolveMediaUrl } from '../utils/media';

export default function Reels() {
  const [params] = useSearchParams();
  const selected = params.get('post');
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [soundOnVideo, setSoundOnVideo] = useState<string | null>(null);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [marketplace, setMarketplace] = useState<SearchResults | null>(null);
  const [hiddenAds, setHiddenAds] = useState<string[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const positioned = useRef(false);

  async function load(before = '') {
    setLoading(true); setError('');
    try {
      const response = await social.posts('', before);
      setPosts(current => before ? [...current, ...response.posts.filter(p => p.videoUrl)] : response.posts.filter(p => p.videoUrl));
      setNext(response.next);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load videos.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    let active = true;
    void searchMarketplace('', 'latest').then(result => { if (active) setMarketplace(result); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  useEffect(() => { positioned.current = false; }, [selected]);
  useEffect(() => {
    if (!positioned.current && selected && posts.some(p => p.id === selected)) {
      const card = document.getElementById('post-' + selected);
      if (card && scroller.current) scroller.current.scrollTop = card.offsetTop - scroller.current.offsetTop;
      positioned.current = true;
    }
    if (!positioned.current && selected && !loading && !error && next && !posts.some(p => p.id === selected)) void load(next);
  }, [posts, selected, loading, error, next]);
  function requireAuth() {
    if (isAuthenticated) return true;
    setAuthOpen(true); return false;
  }
  const suggestions = marketplace?.products.filter(p => !hiddenAds.includes(p.id)).slice(0, 4) || [];
  return <>
    <section className="reels-page supplied-reels-page">
      <FeedTopTabs activeTab="latest" onTabChange={tab => navigate('/?tab=' + tab)} onRequireAuth={requireAuth} />
      <div className="reels-layout">
        <div ref={scroller} className="reels-feed" tabIndex={0} aria-label="Videos, scroll for the next post" onKeyDown={e => {
          if (e.target !== e.currentTarget || !['ArrowDown', 'ArrowUp'].includes(e.key)) return;
          e.preventDefault();
          scroller.current?.scrollBy({ top: (e.key === 'ArrowDown' ? 1 : -1) * scroller.current.clientHeight, behavior: 'smooth' });
        }}>
          {selected && !loading && !error && !next && !posts.some(p => p.id === selected) && <p role="status">The shared video is no longer available.</p>}
          {posts.map(post => <ReelCard key={post.id} post={post} soundOn={soundOnVideo === post.id} onToggleSound={() => setSoundOnVideo(current => current === post.id ? null : post.id)} />)}
          {(loading || error || next || !posts.length) && <div className="reels-status">
            {loading ? <p role="status">Loading videos…</p> : error ? <><p role="alert">{error}</p><button onClick={() => void load(next || '')}>Retry</button></> : next ? <button onClick={() => void load(next)}>Load more videos</button> : <><h1>No videos yet</h1><p>Be the first to share a video on Gleenc.</p><Link to="/create-video">Post a video</Link></>}
          </div>}
        </div>
        <aside className="reels-right-panel">
          {suggestions.length > 0 && <div className="reels-ad-slider" aria-label="Discover products">
            <div className="reels-ad-track">
              {suggestions.map(product => <article className="reels-ad-card ad-gray" key={product.id}>
                <button className="ad-close-btn" aria-label={'Dismiss ' + product.name} onClick={() => setHiddenAds(current => [...current, product.id])}>×</button>
                <div className="ad-image-wrap">{product.imageUrls[0] && <img src={resolveMediaUrl(product.imageUrls[0], '')} alt={product.name} />}</div>
                <div className="ad-content"><span>{product.category}</span><h3>{product.name}</h3><p>{product.storeName}</p><strong>₦{product.price.toLocaleString()}</strong>
                  <div className="ad-actions"><Link to={'/products/' + product.id}>View product</Link></div>
                </div>
              </article>)}
            </div>
          </div>}
          <div className="trending-services-box"><h3>Discover service offers</h3><p>Explore services from the Gleenc community.</p>
            <div className="service-offer-list">
              {marketplace?.services.slice(0, 5).map(service => <Link key={service.id} to={'/stores/' + service.storeSlug}>{service.name}</Link>)}
              <Link to="/search">Explore the marketplace</Link>
              <Link to="/create-video">Post a video</Link>
            </div>
          </div>
        </aside>
      </div>
    </section>
    <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
  </>;
}
