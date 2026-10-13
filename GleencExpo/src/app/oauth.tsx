import { useRouter } from 'expo-router';
import { Page,Card,Heading,GText,Button } from '@/features/live/ui';
export default function OAuthReturn(){const router=useRouter();return <Page title="Sign-in"><Card><Heading>Return to Gleenc</Heading><GText>If you closed the sign-in window, restart sign-in from the login page.</GText><Button title="Return to sign in" onPress={()=>router.replace('/login')}/></Card></Page>;}
