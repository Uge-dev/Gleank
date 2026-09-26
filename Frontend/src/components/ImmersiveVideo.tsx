import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiMaximize, FiPause, FiPlay, FiShare2, FiUser, FiVolume2, FiVolumeX } from 'react-icons/fi';
import type { SocialPost } from '../services/social.service';
import { resolveMediaUrl } from '../utils/media';
import './ImmersiveVideo.css';

export default function ImmersiveVideo({ post, immersive = false }: { post: SocialPost; immersive?: boolean }) {
  const root = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const visible = useRef(false);
  const manuallyPaused = useRef(false);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const media = video.current;
    if (!media || !root.current) return;
    const sync = () => {
      if (visible.current && !document.hidden && !manuallyPaused.current) void media.play().catch(() => setPlaying(false));
      else media.pause();
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible.current = entry.isIntersecting && entry.intersectionRatio >= 0.6;
      sync();
    }, { threshold: [0, 0.6, 1] });
    observer.observe(root.current);
    document.addEventListener('visibilitychange', sync);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', sync); media.pause(); };
  }, [post.videoUrl]);
  function togglePlayback() {
    const media = video.current;
    if (!media) return;
    manuallyPaused.current = !media.paused;
    if (media.paused) void media.play().catch(() => setError('Could not play this video. Please try again.'));
    else media.pause();
  }
  async function share() {
    const url = new URL('/reels?post=' + encodeURIComponent(post.id), window.location.origin).href;
    try {
      if (navigator.share) await navigator.share({ title: post.author + ' on Gleenc', url });
      else { await navigator.clipboard.writeText(url); setNotice('Video link copied'); }
    } catch (e) { if (!(e instanceof DOMException && e.name === 'AbortError')) setNotice('Could not share. Please try again.'); }
  }
  return <article ref={root} className="immersive-video" id={'post-' + post.id} aria-label={'Video by ' + post.author}>
    <video ref={video} src={resolveMediaUrl(post.videoUrl, '')} playsInline loop muted={muted} preload="metadata" aria-label={post.caption || 'Video by ' + post.author}
      onPlay={() => { setPlaying(true); setError(''); }} onPause={() => setPlaying(false)} onError={() => setError('This video could not be loaded.')}
      onTimeUpdate={() => { const v = video.current; if (v && Number.isFinite(v.duration) && v.duration > 0) setProgress(v.currentTime / v.duration * 100); }}/>
    <button className="immersive-video__surface" onClick={togglePlayback} aria-label={playing ? 'Pause video' : 'Play video'}>{!playing && !error && <FiPlay className="immersive-video__play" />}</button>
    <div className="immersive-video__caption">
      <Link to={'/community/' + post.userId}><strong>{post.username ? '@' + post.username : post.author}</strong></Link>
      {post.caption && <p>{post.caption}</p>}
      {post.productId && <Link className="immersive-video__shop" to={'/products/' + post.productId + (post.referralId ? '?ref=' + encodeURIComponent(post.referralId) : '')}>Shop {post.productName} · ₦{post.productPrice.toLocaleString()}</Link>}
      {error && <p role="alert">{error} <button onClick={() => { video.current?.load(); togglePlayback(); }}>Retry</button></p>}
      {notice && <p role="status">{notice}</p>}
    </div>
    <div className="immersive-video__actions">
      <Link to={'/community/' + post.userId} aria-label={'View profile of ' + post.author}><FiUser /></Link>
      <button onClick={() => setMuted(v => !v)} aria-label={muted ? 'Unmute video' : 'Mute video'}>{muted ? <FiVolumeX /> : <FiVolume2 />}</button>
      <button onClick={togglePlayback} aria-label={playing ? 'Pause video' : 'Play video'}>{playing ? <FiPause /> : <FiPlay />}</button>
      <button onClick={() => void share()} aria-label="Share video"><FiShare2 /></button>
      {!immersive && <Link to={'/reels?post=' + encodeURIComponent(post.id)} aria-label="Open full-screen video viewer"><FiMaximize /></Link>}
    </div>
    <input className="immersive-video__seek" type="range" min="0" max="100" step="0.1" value={progress} aria-label="Video progress" onChange={e => {
      const v = video.current; if (v && Number.isFinite(v.duration)) { v.currentTime = Number(e.target.value) / 100 * v.duration; setProgress(Number(e.target.value)); }
    }}/>
  </article>;
}
