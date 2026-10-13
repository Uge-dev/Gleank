import { FRONTEND_PREVIEW } from '@/config/preview';
import { SearchPage as ServerScreen } from '@/features/live/social-pages';
import { Redirect } from 'expo-router';
function PreviewExplore() { return <Redirect href="/home" />; }

export default function ConnectedRoute(){return FRONTEND_PREVIEW ? <PreviewExplore/> : <ServerScreen/>;}
