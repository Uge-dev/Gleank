import { useRouter } from 'expo-router';
import { Page, Empty, Button } from '@/features/studio/ui';
export default function NotFound() {
    const router = useRouter();
    return <Page title="Page unavailable"><Empty title="This link is unavailable" detail="The content may have been removed or the link is incomplete." icon="link-outline"/><Button title="Go to Home" onPress={() => router.replace('/home')}/></Page>;
}
