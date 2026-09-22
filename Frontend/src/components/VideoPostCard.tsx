import { Link } from 'react-router-dom';
import type { SocialPost } from '../services/social.service';
import { resolveMediaUrl } from '../utils/media';
export default function VideoPostCard({ post }: {
    post: SocialPost;
}) {
    return <article className="feed-card" id={'post-' + post.id}>
    <header className="feed-card-header"><Link to={'/community/' + post.userId}>{post.author} {post.username && '@' + post.username}</Link><time dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleDateString()}</time></header>
    {post.videoUrl ? <video controls playsInline preload="metadata" src={resolveMediaUrl(post.videoUrl, '')} style={{ width: '100%', maxHeight: 560, background: '#111' }} aria-label={post.caption}/> : post.imageUrl && <img loading="lazy" src={resolveMediaUrl(post.imageUrl, '')} alt={post.productName} style={{ width: '100%', maxHeight: 560, objectFit: 'contain' }}/>}
    <div className="feed-info">{post.mode && <small>{post.mode === 'dropshipping' ? 'Supplier-fulfilled offer' : 'Commission-earning recommendation'}</small>}<p>{post.caption}</p>{post.productId ? <Link className="commerce-action" to={'/products/' + post.productId + (post.referralId ? '?ref=' + encodeURIComponent(post.referralId) : '')}>Shop {post.productName} · ₦{post.productPrice.toLocaleString()}</Link> : post.referralId && <p>This product is currently unavailable.</p>}</div>
  </article>;
}
