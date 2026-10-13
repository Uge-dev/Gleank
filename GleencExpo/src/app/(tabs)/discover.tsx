import { FRONTEND_PREVIEW } from '@/config/preview';
import { SearchPage as ServerScreen } from '@/features/live/social-pages';
import Market from './market';

function PreviewExplore() {
  return <Market />;
}

export default function ConnectedRoute(){return FRONTEND_PREVIEW ? <PreviewExplore/> : <ServerScreen/>;}
