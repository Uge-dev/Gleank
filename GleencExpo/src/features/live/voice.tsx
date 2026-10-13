import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { api } from '@/services/api';
import { VoiceNote } from '@/features/chat/voice';
import type { Attachment } from '@/features/chat/chat-state';
import { cachePrivateBlob } from './media';
import { Action, Notice } from './ui';
export function PrivateVoice({ file }: {
    file: {
        id: string;
        name: string;
        bytes: number;
        mime_type?: string;
    };
}) {
    const [uri, setUri] = useState('');
    useEffect(() => () => { if (Platform.OS === 'web' && uri)
        URL.revokeObjectURL(uri); }, [uri]);
    if (!uri)
        return <Action title="Load voice note" secondary run={async () => { const blob = await api.media.private(file.id); setUri(await cachePrivateBlob(blob, file.id + '-' + file.name)); }}/>;
    return <VoiceNote attachment={{ id: file.id, kind: 'voice', uri, name: file.name, mime: file.mime_type || 'audio/mp4', bytes: file.bytes, durationMs: 0 } as Attachment}/>;
}
