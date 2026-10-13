import { sampleVideoSource } from './sample-videos';
import type { FeedItem } from './data';
import { Component, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, AppState, Image, Platform, Pressable, StyleSheet, View } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { GText } from '@/components/gleenc/text';

type VideoPackage = typeof import('expo-video');
let videoPackage: VideoPackage | null = null;
try {
  if (Platform.OS === 'web' || requireOptionalNativeModule('ExpoVideo')) videoPackage = require('expo-video') as VideoPackage;
} catch { /* The installed client may predate expo-video. */ }

type Props = { asset?: FeedItem['videoAsset']; uri?: string; poster: string; active: boolean; muted: boolean; paused?: boolean };
// Image does not expose pointerEvents in React Native's ImageProps.
// Let its View container keep posters from intercepting feed interactions.
function Poster({ uri }: { uri: string }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
    </View>
  );
}
export function VideoSurface(props: Props) {
  const [attempt, setAttempt] = useState(0);
  // FlatList can keep several pages mounted. Only the visible page owns a player.
  if (!props.active) return <Poster uri={props.poster} />;
  if ((!props.uri && !props.asset) || !videoPackage) return <View pointerEvents="box-none" style={styles.surface}><Poster uri={props.poster} /><Failure message={(!props.uri && !props.asset) ? 'This post has no video attached.' : 'Video playback is missing from this installed app. Install the new development build containing expo-video.'} /></View>;
  return <VideoBoundary key={(props.asset || props.uri) + ':' + attempt} poster={props.poster} onRetry={() => setAttempt(v => v + 1)}>
    <NativeVideoSurface {...props} uri={props.uri ?? ''} module={videoPackage} onRetry={() => setAttempt(v => v + 1)} />
  </VideoBoundary>;
}
function Failure({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <View style={styles.error}><GText weight="bold" style={{ color: '#FFFFFF', textAlign: 'center' }}>Video unavailable</GText><GText selectable style={{ color: '#E5E5E5', fontSize: 12, textAlign: 'center' }}>{message.slice(0, 240)}</GText>{onRetry ? <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="Retry video playback" style={styles.retry}><GText weight="bold" style={{ color: '#111111' }}>Retry video</GText></Pressable> : null}</View>;
}
class VideoBoundary extends Component<{ poster: string; onRetry: () => void; children: ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: unknown) { return { error: error instanceof Error ? error.message : 'The native video player could not start.' }; }
  render() { return this.state.error ? <View pointerEvents="box-none" style={styles.surface}><Poster uri={this.props.poster} /><Failure message={this.state.error} onRetry={this.props.onRetry} /></View> : this.props.children; }
}
function NativeVideoSurface({ asset, uri, poster, active, muted, paused = false, module, onRetry }: Props & { uri: string; module: VideoPackage; onRetry: () => void }) {
  const player = module.useVideoPlayer(sampleVideoSource(asset) ?? { uri }, instance => { instance.loop = true; instance.muted = muted; });
  const [status, setStatus] = useState(player.status);
  const [error, setError] = useState('');
  const [firstFrame, setFirstFrame] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');

  useEffect(() => {
    let mounted = true;
    const subscription = player.addListener('statusChange', event => {
      if (!mounted) return;
      setStatus(event.status);
      setError(event.status === 'error' ? event.error?.message || 'The source could not be played. Check your connection and try again.' : '');
    });
    // A bundled clip can become ready between render and listener attachment.
    setStatus(player.status);
    const app = AppState.addEventListener('change', state => { if (mounted) setForeground(state === 'active'); });
    return () => { mounted = false; try { subscription.remove(); } catch { /* The hook may already have released its shared object. */ } app.remove(); };
    // The hook owns player release. Never call player.pause/release in cleanup.
  }, [player]);

  useEffect(() => {
    try {
      player.muted = muted;
      if (active && foreground && !paused && status === 'readyToPlay') player.play();
      else if (status === 'readyToPlay') player.pause();
    } catch (e) { setError(e instanceof Error ? e.message : 'The video player stopped. Tap retry.'); }
  }, [active, paused, foreground, muted, status, player]);

  useEffect(() => {
    if (status !== 'loading' && status !== 'idle') return;
    const timeout = setTimeout(() => setError('Loading is taking too long. Check mobile data or Wi-Fi and retry.'), 25000);
    return () => clearTimeout(timeout);
  }, [status]);

  const VideoView = module.VideoView;
  return <View pointerEvents="box-none" style={styles.surface}>
    <VideoView pointerEvents="none" style={StyleSheet.absoluteFill} player={player} nativeControls={false} contentFit="cover" surfaceType="textureView" onFirstFrameRender={() => setFirstFrame(true)} />
    {!firstFrame || error ? <Poster uri={poster} /> : null}
    {!error && !firstFrame ? <View pointerEvents="none" style={styles.loading}><ActivityIndicator size="large" color="#FFFFFF" /><GText style={{ color: '#FFFFFF', fontSize: 12 }}>Loading video…</GText></View> : null}
    {error ? <Failure message={error} onRetry={onRetry} /> : null}
  </View>;
}
const styles = StyleSheet.create({ surface: { ...StyleSheet.absoluteFill, zIndex: 1 }, loading: { position: 'absolute', top: '35%', alignSelf: 'center', gap: 10, alignItems: 'center', padding: 15, borderRadius: 16, backgroundColor: 'rgba(0,0,0,.4)' }, error: { position: 'absolute', top: '24%', left: 20, right: 76, backgroundColor: 'rgba(0,0,0,.8)', borderRadius: 17, padding: 15, gap: 10, zIndex: 3 }, retry: { backgroundColor: '#FFFFFF', borderRadius: 12, minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14 } });
