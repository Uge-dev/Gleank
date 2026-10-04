import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiBookmark, FiHeart, FiMessageCircle, FiSend, FiShoppingCart, FiVolume2, FiVolumeX, FiPlay, FiMaximize } from 'react-icons/fi';
import AuthModal from './AuthModal';
import ProductCommentDrawer from './ProductCommentDrawer';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useSaved } from '../context/SavedContext';
import { getPublicProduct, likePublicProduct, unlikePublicProduct } from '../services/marketplace.service';
import { followPublicStore, unfollowPublicStore } from '../services/seller.service';
import type { ProductDetailsResponse } from '../types/domain';
import type { SocialPost } from '../services/social.service';
import { resolveMediaUrl } from '../utils/media';
import './ReelLayout.css';

// The supplied ReelCard structure, connected to real posts and product actions.
export default function ReelCard({ post, embedded = false, soundOn, onToggleSound }: {
  post: SocialPost; embedded?: boolean; soundOn?: boolean; onToggleSound?: () => void;
}) {
  const cardRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const manuallyPaused = useRef(false);
  const [visible, setVisible] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [localSound, setLocalSound] = useState(false);
  const [data, setData] = useState<ProductDetailsResponse | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [videoError, setVideoError] = useState(false);
  const { isAuthenticated, user } = useAuth();
  const { addToCart, openCartDrawer, cartDrawerOpen } = useCart();
  const { isSaved, toggleSaved } = useSaved();
  const navigate = useNavigate();
  const audible = soundOn ?? localSound;
  const productPath = post.productId ? '/products/' + post.productId + (post.referralId ? '?ref=' + encodeURIComponent(post.referralId) : '') : '';
  const product = data?.product;
  const productReady = Boolean(product);

  useEffect(() => {
    if (!cardRef.current) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting && entry.intersectionRatio >= .6), { threshold: [0, .6, 1] });
    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const sync = () => {
      if (visible && !document.hidden && !manuallyPaused.current && !authOpen && !commentsOpen && !cartDrawerOpen) void video.play().catch(() => setPlaying(false));
      else video.pause();
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => { document.removeEventListener('visibilitychange', sync); video.pause(); };
  }, [visible, authOpen, commentsOpen, cartDrawerOpen]);
  useEffect(() => {
    if (!visible || !post.productId) return;
    let active = true;
    void getPublicProduct(post.productId).then(result => { if (active) setData(result); }).catch(() => { if (active) setData(null); });
    return () => { active = false; };
  }, [visible, post.productId, isAuthenticated]);
  function requireAuth() {
    if (isAuthenticated) return true;
    setAuthOpen(true); return false;
  }
  async function run(action: () => Promise<void>) {
    if (busy || !requireAuth()) return;
    setBusy(true); setNotice('');
    try { await action(); } catch (e) { setNotice(e instanceof Error ? e.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    manuallyPaused.current = !video.paused;
    if (video.paused) void video.play().catch(() => setVideoError(true)); else video.pause();
  }
  async function share() {
    const url = new URL('/reels?post=' + encodeURIComponent(post.id), window.location.origin).href;
    try {
      if (navigator.share) await navigator.share({ title: post.author + ' on Gleenc', url });
      else { await navigator.clipboard.writeText(url); setNotice('Video link copied'); }
    } catch (e) { if (!(e instanceof DOMException && e.name === 'AbortError')) setNotice('Could not share this video. Please try again.'); }
  }
  async function addProduct() {
    if (!post.productId) return;
    const fresh = await getPublicProduct(post.productId);
    const p = fresh.product;
    if (p.store.ownerId === user?.id) { setNotice('You cannot order your own product.'); return; }
    if (p.status !== 'active' || p.stock <= 0) { setNotice('This product is currently unavailable.'); return; }
    if (p.availableSizes?.length) { navigate(productPath); return; }
    addToCart({ id: p.id, name: p.name, price: '₦' + p.price.toLocaleString(), numericPrice: p.price,
      image: resolveMediaUrl(p.imageUrls[0], ''), sellerName: p.store.name, sellerId: p.store.slug,
      campus: p.store.campus, stock: p.stock, category: p.category, quantity: 1,
      referralId: post.referralId || undefined, detailsPath: productPath, deliveryReadinessLabel: p.deliveryReadiness?.label });
    openCartDrawer();
  }
  const unsupported = 'Available on videos with a linked product';
  const saved = post.productId ? isSaved('product', post.productId) : false;
  return <>
    <article className={'reel-card gleenc-reel-card' + (embedded ? ' for-you-reel-card' : '')} ref={cardRef} id={'post-' + post.id} aria-label={'Video by ' + post.author}>
      <video ref={videoRef} src={resolveMediaUrl(post.videoUrl, '')} loop muted={!audible} playsInline preload="metadata" aria-label={post.caption || 'Video by ' + post.author}
        onPlay={() => { setPlaying(true); setVideoError(false); }} onPause={() => setPlaying(false)} onError={() => setVideoError(true)} />
      <button className="reel-play-surface" onClick={togglePlayback} aria-label={playing ? 'Pause video' : 'Play video'}>{!playing && !videoError && <FiPlay />}</button>
      <div className="reel-gradient" />
      <button type="button" className="reel-sound-btn" onClick={onToggleSound || (() => setLocalSound(v => !v))} aria-label={audible ? 'Mute reel' : 'Unmute reel'}>{audible ? <FiVolume2 /> : <FiVolumeX />}</button>
      {embedded && <Link to={'/reels?post=' + encodeURIComponent(post.id)} className="reel-expand-btn" aria-label="Open reels"><FiMaximize /></Link>}
      <div className="reel-info">
        <div className="reel-seller-row">
          <Link to={'/community/' + post.userId} className="reel-seller-link"><div className="reel-avatar">{post.author.charAt(0)}</div><div><h3>{post.author}</h3>{post.username && <p>@{post.username}</p>}</div></Link>
          {product?.store.ownerId === post.userId && user?.id !== post.userId && <button disabled={busy} aria-pressed={data?.storeInteraction.isFollowing} onClick={() => void run(async () => {
            const result = await (data?.storeInteraction.isFollowing ? unfollowPublicStore : followPublicStore)(product.store.slug);
            setData(current => current ? { ...current, storeInteraction: result.interaction } : current);
          })}>{data?.storeInteraction.isFollowing ? 'Following' : 'Follow'}</button>}
        </div>
        {post.productId && <Link to={productPath} className="reel-product-link"><h2>{post.productName}</h2><strong>₦{(product?.price ?? post.productPrice).toLocaleString()}</strong></Link>}
        <p>{post.caption}</p>
        {post.productId && <small>Interactions below apply to this product.</small>}
        {videoError && <p role="alert">Video could not load. <button onClick={() => { videoRef.current?.load(); manuallyPaused.current = false; void videoRef.current?.play().catch(() => setVideoError(true)); }}>Retry</button></p>}
        {notice && <p role="status">{notice}</p>}
      </div>
      <div className="reel-actions">
        <button type="button" disabled={!productReady || busy} title={!post.productId ? unsupported : undefined} aria-label={data?.interaction.liked ? 'Unlike product' : 'Like product'} aria-pressed={data?.interaction.liked ?? false} onClick={() => void run(async () => {
          if (!post.productId || !data) return;
          const result = await (data.interaction.liked ? unlikePublicProduct : likePublicProduct)(post.productId);
          setData(current => current ? { ...current, interaction: result.interaction } : current);
        })}><FiHeart /><span>{data ? data.interaction.likeCount.toLocaleString() : '—'}</span></button>
        <button type="button" disabled={!productReady} title={!post.productId ? unsupported : undefined} aria-label="Product comments" onClick={() => setCommentsOpen(true)}><FiMessageCircle /><span>{data ? data.interaction.commentCount.toLocaleString() : '—'}</span></button>
        <button type="button" disabled={!productReady || busy} title={!post.productId ? unsupported : undefined} aria-label={saved ? 'Unsave product' : 'Save product'} aria-pressed={saved} onClick={() => void run(async () => {
          if (!post.productId) return;
          const nowSaved = await toggleSaved('product', post.productId);
          setData(current => current ? { ...current, interaction: { ...current.interaction, saveCount: Math.max(0, current.interaction.saveCount + (nowSaved ? 1 : -1)) } } : current);
        })}><FiBookmark /><span>{data ? data.interaction.saveCount.toLocaleString() : '—'}</span></button>
        <button type="button" aria-label="Share video" onClick={() => void share()}><FiSend /><span>Share</span></button>
        {post.productId && <button type="button" className="reel-cart-btn" disabled={busy} aria-label="Add product to cart" onClick={() => void run(addProduct)}><FiShoppingCart /></button>}
      </div>
    </article>
    <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
    {commentsOpen && <ProductCommentDrawer isOpen productId={post.productId} productName={post.productName} onClose={() => setCommentsOpen(false)} onRequireAuth={requireAuth} onCommentCreated={() => {
      if (post.productId) void getPublicProduct(post.productId).then(setData).catch(() => undefined);
    }} />}
  </>;
}
