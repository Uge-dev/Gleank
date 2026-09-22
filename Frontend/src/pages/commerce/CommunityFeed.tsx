import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { social, type SocialPost } from '../../services/social.service';
import VideoPostCard from '../../components/VideoPostCard';
import { useAuth } from '../../context/AuthContext';
import './Commerce.css';
export default function CommunityFeed() {
    const { userId = '' } = useParams();
    const { user } = useAuth();
    const [posts, setPosts] = useState<SocialPost[]>([]), [error, setError] = useState(''), [loading, setLoading] = useState(true);
    const [next, setNext] = useState<string | null>(null);
    const load = async (before = '') => { setLoading(true); setError(''); try {
        const r = await social.posts(userId, before);
        setPosts(p => before ? [...p, ...r.posts] : r.posts);
        setNext(r.next);
    }
    catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load videos.');
    }
    finally {
        setLoading(false);
    } };
    useEffect(() => { void load(); }, [userId]);
    return <section className="commerce-page"><h1>{userId ? 'Community profile' : 'Videos'}</h1><p>Real posts from the Gleenc community, newest first.</p><Link className="commerce-action primary" to="/create-video">Post a video</Link>
    {error && <p role="alert">{error} <button onClick={() => void load()}>Retry</button></p>}{loading && <p role="status">Loading…</p>}{!loading && !error && !posts.length && <p>No videos yet. Be the first to share.</p>}
    {posts.filter(p => userId || p.videoUrl).map(p => <div key={p.id}><VideoPostCard post={p}/>{user?.id === p.userId && <button disabled={loading} onClick={async () => { try {
        await social.remove(p.id);
        setPosts(current => current.filter(post => post.id !== p.id));
    }
    catch (e) {
        setError(e instanceof Error ? e.message : 'Could not remove post.');
    } }}>Remove from feed</button>}</div>)}{next && <button disabled={loading} onClick={() => void load(next)}>Load more</button>}</section>;
}
