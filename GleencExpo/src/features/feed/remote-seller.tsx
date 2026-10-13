import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/services/api';
import type { Person } from '@/services/gleenc-api';
import { getApiErrorMessage } from '@/services/api-client';
import { GText } from '@/components/gleenc/text';
import { useAppTheme } from '@/hooks/use-app-theme';
export function RemoteSeller() {
  const { userId } = useLocalSearchParams<{ userId?: string }>();
  const router = useRouter(); const { colors } = useAppTheme();
  const [person, setPerson] = useState<Person | null>(null);
  const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setPerson(null); setError('');
    if (typeof userId !== 'string' || !userId) { setError('Open a profile from a server product.'); setLoading(false); return; }
    api.people.get(userId).then(result => { if (active) setPerson(result); }).catch(e => { if (active) setError(getApiErrorMessage(e)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId, retry]);
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
    <Pressable onPress={() => router.back()} style={{ padding: 18 }} accessibilityLabel="Back"><Ionicons name="arrow-back" size={24} color={colors.text}/></Pressable>
    {loading ? <ActivityIndicator color={colors.text}/> : error ? <View style={{ padding: 20, gap: 14 }}><GText>{error}</GText><Pressable onPress={() => setRetry(value => value + 1)}><GText weight="bold">Retry</GText></Pressable></View> : person ? <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
      {person.coverUrl ? <Image source={{ uri: person.coverUrl }} style={{ height: 180, borderRadius: 18 }}/> : null}
      {person.avatarUrl ? <Image source={{ uri: person.avatarUrl }} style={{ width: 86, height: 86, borderRadius: 43 }}/> : <View style={{ width: 86, height: 86, borderRadius: 43, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="person-outline" size={38} color={colors.text}/></View>}
      <GText weight="bold" style={{ fontSize: 26 }}>{person.name}</GText>
      {person.username ? <GText tone="muted">@{person.username.replace(/^@/, '')}</GText> : null}
      {person.bio ? <GText>{person.bio}</GText> : null}
    </ScrollView> : null}
  </SafeAreaView>;
}
