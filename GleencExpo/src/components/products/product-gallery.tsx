import { useRef, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GText } from '@/components/gleenc/text';
import { useAppTheme } from '@/hooks/use-app-theme';

type Props = {
  images: string[];
  height: number;
  onImagePress?: () => void;
  showThumbnails?: boolean;
};

export function ProductGallery({ images, height, onImagePress, showThumbnails = false }: Props) {
  const { colors } = useAppTheme();
  const list = useRef<FlatList<string>>(null);
  const [width, setWidth] = useState(1);
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const sources = images.filter(Boolean);
  const multiple = sources.length > 1;

  function goTo(index: number) {
    const next = Math.max(0, Math.min(index, sources.length - 1));
    setActive(next);
    list.current?.scrollToOffset({ offset: next * width, animated: true });
  }

  return (
    <View>
      <View onLayout={event => setWidth(Math.max(1, event.nativeEvent.layout.width))} style={[styles.frame, { height, backgroundColor: colors.surfaceSecondary }]}>
        {sources.length ? (
          <FlatList
            ref={list}
            data={sources}
            horizontal
            pagingEnabled
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(uri, index) => `${uri}-${index}`}
            onMomentumScrollEnd={event => setActive(Math.round(event.nativeEvent.contentOffset.x / width))}
            renderItem={({ item: uri }) => (
              <Pressable onPress={onImagePress} style={[styles.slide, { width, height }]} accessibilityLabel="Open product details">
                {failed.includes(uri) ? (
                  <View style={[styles.fallback, { backgroundColor: colors.surfaceSecondary }]}>
                    <Ionicons name="image-outline" size={38} color={colors.textMuted} />
                    <GText tone="muted" style={{ marginTop: 7 }}>Image unavailable</GText>
                  </View>
                ) : (
                  <Image source={{ uri }} resizeMode="cover" style={styles.image} onError={() => setFailed(previous => previous.includes(uri) ? previous : [...previous, uri])} />
                )}
              </Pressable>
            )}
          />
        ) : <View style={styles.fallback}><Ionicons name="image-outline" size={36} color={colors.textMuted} /></View>}
        {multiple && (
          <>
            <Pressable onPress={() => goTo(active - 1)} disabled={active === 0} style={[styles.arrow, { left: 12, opacity: active === 0 ? 0.45 : 1 }]} accessibilityLabel="Previous image">
              <Ionicons name="chevron-back" size={22} color="#161616" />
            </Pressable>
            <Pressable onPress={() => goTo(active + 1)} disabled={active === sources.length - 1} style={[styles.arrow, { right: 12, opacity: active === sources.length - 1 ? 0.45 : 1 }]} accessibilityLabel="Next image">
              <Ionicons name="chevron-forward" size={22} color="#161616" />
            </Pressable>
            <View pointerEvents="none" style={styles.dots}>{sources.map((_, index) => <View key={index} style={[styles.dot, index === active && styles.dotActive]} />)}</View>
          </>
        )}
      </View>
      {showThumbnails && multiple && (
        <FlatList horizontal data={sources} keyExtractor={(uri, index) => `thumb-${uri}-${index}`} showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.thumbnails} renderItem={({ item: uri, index }) => (
            <Pressable onPress={() => goTo(index)} style={[styles.thumb, { borderColor: index === active ? colors.primary : colors.border }]} accessibilityLabel={`Show image ${index + 1}`}>
              <Image source={{ uri }} style={styles.thumbImage} resizeMode="cover" />
            </Pressable>
          )} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', overflow: 'hidden', justifyContent: 'center' },
  slide: { justifyContent: 'center' }, image: { width: '100%', height: '100%' },
  fallback: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  arrow: { position: 'absolute', top: '44%', width: 39, height: 39, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.95)', justifyContent: 'center', alignItems: 'center' },
  dots: { position: 'absolute', bottom: 12, alignSelf: 'center', flexDirection: 'row', gap: 5, backgroundColor: 'rgba(255,255,255,0.92)', padding: 7, borderRadius: 20 },
  dot: { width: 6, height: 6, borderRadius: 4, backgroundColor: '#BBBBBB' }, dotActive: { width: 16, backgroundColor: '#161616' },
  thumbnails: { paddingHorizontal: 16, paddingVertical: 12, gap: 9 },
  thumb: { borderWidth: 2, borderRadius: 12, padding: 2 }, thumbImage: { width: 51, height: 51, borderRadius: 8 },
});
