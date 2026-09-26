import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { FiX } from 'react-icons/fi';
import ImmersiveVideo from '../components/ImmersiveVideo';
import { social, type SocialPost } from '../services/social.service';

export default function Reels() {
  const [params] = useSearchParams();
  const selected = params.get('post');
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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
    const previous = document.body.style.overflow;
    const app = document.getElementById('root');
    const wasInert = app?.inert ?? false;
    if (app) app.inert = true;
    document.body.style.overflow = 'hidden';
    scroller.current?.focus();
    return () => { document.body.style.overflow = previous; if (app) app.inert = wasInert; };
  }, []);
  useEffect(() => {
    if (!positioned.current && selected && posts.some(p => p.id === selected)) {
      document.getElementById('post-' + selected)?.scrollIntoView();
      positioned.current = true;
    }
    // Follow older shared links through pagination, rather than opening a different video.
    if (!positioned.current && selected && !loading && !error && next && !posts.some(p => p.id === selected)) void load(next);
  }, [posts, selected, loading, error, next]);
  return createPortal(<section className="video-viewer" aria-label="Videos">
    <Link to="/" className="video-viewer__close" aria-label="Back to home"><FiX /></Link>
    {selected && !loading && !error && !next && !posts.some(p => p.id === selected) && <p className="video-viewer__missing" role="status">The shared video is no longer available.</p>}
    <div ref={scroller} className="video-viewer__scroll" tabIndex={0} aria-label="Swipe or scroll for the next video" onKeyDown={e => {
      if (e.target !== e.currentTarget || !['ArrowDown', 'ArrowUp'].includes(e.key)) return;
      e.preventDefault();
      scroller.current?.scrollBy({ top: (e.key === 'ArrowDown' ? 1 : -1) * scroller.current.clientHeight, behavior: 'smooth' });
    }}>
      {posts.map(post => <ImmersiveVideo key={post.id} post={post} immersive />)}
      {(loading || error || next || !posts.length) && <div className="video-viewer__status">
        {loading ? <p role="status">Loading videos…</p> : error ? <><p role="alert">{error}</p><button onClick={() => void load(next || '')}>Retry</button></> : next ? <button onClick={() => void load(next)}>Load more videos</button> : <><h1>No videos yet</h1><p>Be the first to share a video on Gleenc.</p><Link to="/create-video">Post a video</Link></>}
      </div>}
    </div>
  </section>, document.body);
}
