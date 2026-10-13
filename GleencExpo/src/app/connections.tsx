import { FRONTEND_PREVIEW } from '@/config/preview';
import { ConnectionsPage as ServerScreen } from '@/features/live/social-pages';
import { LoadingState } from '@/features/experience/recovery';
import { useState } from 'react';
import { Alert, Image, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCommunity } from '@/features/community/community-state';
import { useAccount } from '@/features/account/account-state';
import { Page, Card, Chips, Input, Button, Empty, Notice } from '@/features/studio/ui';
import { GText } from '@/components/gleenc/text';
import { explain } from '@/features/account/guards';
function PreviewConnections() {
    const p = useLocalSearchParams<{
        seller?: string;
        mode?: string;
    }>();
    const social = useCommunity();
    const account = useAccount();
    const router = useRouter();
    const [tab, setTab] = useState(p.mode === 'followers' ? 'Followers' : 'Following');
    const [query, setQuery] = useState('');
    const mine = !p.seller || p.seller === social.me.store;
    const following = social.followingFor(mine ? social.me.store : p.seller!);
    const followers = social.followersFor(mine ? social.me.store : p.seller!);
    const people = (tab === 'Following' ? following : followers).filter(person => !account.isBlocked(person.store) && (person.name + person.handle).toLowerCase().includes(query.toLowerCase()));
    if (!social.ready)
        return <Page title="Your connections"><LoadingState label="Loading people…"/></Page>;
    return <Page title={mine ? 'Your connections' : p.seller!}><Notice text={social.notice}/><Chips items={['Followers', 'Following']} value={tab} onChange={setTab}/><Input label="Search people" value={query} onChange={setQuery} maxLength={100}/>{people.length ? people.map(person => <Card key={person.id}><View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><Pressable accessibilityLabel={`Open ${person.name} profile`} onPress={() => router.push({ pathname: '/store', params: { seller: person.store } })} style={{ flexDirection: 'row', gap: 12, flex: 1, alignItems: 'center', minHeight: 48 }}><Image source={{ uri: person.avatar }} style={{ width: 48, height: 48, borderRadius: 24 }}/><View style={{ flex: 1 }}><GText weight="bold">{person.name}</GText><GText tone="muted">@{person.handle}</GText></View></Pressable>{person.id !== social.me.id ? <Button title={social.following.includes(person.store) ? 'Following' : 'Follow'} secondary={social.following.includes(person.store)} onPress={() => {
                    try {
                        social.toggleFollow(person.store);
                    }
                    catch (e) {
                        Alert.alert('Try again', explain(e));
                    }
                }}/> : null}</View></Card>) : <Empty title={`No ${tab.toLowerCase()} yet`} detail="Connections appear here when accounts follow each other." icon="people-outline"/>}{mine && !following.length ? <Card><GText weight="bold">Find people to follow</GText>{social.directory.filter(p => p.id !== social.me.id && !account.isBlocked(p.store)).slice(0, 6).map(person => <Pressable key={person.id} onPress={() => router.push({ pathname: '/store', params: { seller: person.store } })} style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12 }}><Image source={{ uri: person.avatar }} style={{ width: 38, height: 38, borderRadius: 19 }}/><GText>{person.name}</GText></Pressable>)}</Card> : null}</Page>;
}

export default function ConnectedRoute(){return FRONTEND_PREVIEW ? <PreviewConnections/> : <ServerScreen/>;}
