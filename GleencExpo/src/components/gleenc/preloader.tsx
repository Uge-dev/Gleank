import { useExperience } from '@/features/experience/experience';
import { Image, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring } from 'react-native-reanimated';
import { useEffect } from 'react';
import { GText } from './text';
import { Colors } from '@/constants/theme';
export function BrandPreloader() {
    const experience = useExperience();
    const scale = useSharedValue(0.86);
    useEffect(() => {
        scale.value = experience.reducedMotion ? 1 : withRepeat(withSequence(withSpring(1.04), withSpring(0.9)), -1, true);
    }, [scale, experience.reducedMotion]);
    const pulse = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
    return (<Animated.View entering={experience.reducedMotion ? undefined : FadeIn.duration(180)} exiting={experience.reducedMotion ? undefined : FadeOut.duration(240)} style={styles.root}>
      <Animated.View style={[styles.logo, pulse]}>
        <Image source={require('../../assets/images/gleenc-logo.png')} style={styles.image} resizeMode="contain"/>
      </Animated.View>
      <View style={styles.brand}><GText weight="bold" style={styles.name}>gleenc</GText><GText tone="white" style={styles.caption}>Explore • Connect • Shop</GText></View>
    </Animated.View>);
}
const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.light.red, alignItems: 'center', justifyContent: 'center' },
    logo: { width: 130, height: 130, borderRadius: 32, overflow: 'hidden' },
    image: { width: '100%', height: '100%' },
    brand: { marginTop: 18, alignItems: 'center', gap: 5 },
    name: { fontSize: 35, letterSpacing: -1.6, color: Colors.light.yellow },
    caption: { fontSize: 12, opacity: 0.92 },
});
