import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { pickLibrary } from '@/features/media/picker';
import { retainMedia } from '@/features/media/retain-media';
import { validateAttachment, type Attachment } from './chat-state';
const docMime: Record<string, string> = { pdf: 'application/pdf', txt: 'text/plain', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
export async function fileBytes(uri: string, fallback?: number) {
    if (Platform.OS === 'web') {
        if (!fallback)
            throw new Error('File size unavailable.');
        return fallback;
    }
    if (!requireOptionalNativeModule('ExponentFileSystem'))
        throw new Error('Install the new development build containing expo-file-system.');
    const fs = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
    const info = await fs.getInfoAsync(uri);
    if (!info.exists || !info.size)
        throw new Error('The selected file is unavailable. Pick it again.');
    return info.size;
}
export async function pickChatAttachment(kind: 'image' | 'video' | 'document'): Promise<Attachment | null> {
    if (kind === 'document') {
        if (Platform.OS !== 'web' && !requireOptionalNativeModule('ExpoDocumentPicker'))
            throw new Error('Install the new development build containing expo-document-picker.');
        const result = await (require('expo-document-picker') as typeof import('expo-document-picker')).getDocumentAsync({ type: Object.values(docMime), copyToCacheDirectory: true, multiple: false });
        if (result.canceled)
            return null;
        const file = result.assets[0];
        const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
        const a = validateAttachment({ kind, uri: file.uri, name: file.name, mime: docMime[ext] ?? '', bytes: await fileBytes(file.uri, file.size) });
        return { ...a, uri: await retainMedia(a.uri) };
    }
    const selected = await pickLibrary(kind === 'image' ? 'images' : 'videos', 1);
    if (!selected[0])
        return null;
    const file = selected[0];
    const ext = file.uri.split('?')[0].split('.').pop()?.toLowerCase();
    const name = kind === 'video' ? 'Video.' + (ext === 'mov' ? 'mov' : 'mp4') : 'Photo.' + (['png', 'webp', 'heic', 'heif'].includes(ext ?? '') ? ext : 'jpg');
    const mime = kind === 'video' ? ext === 'mov' ? 'video/quicktime' : 'video/mp4' : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'heic' ? 'image/heic' : ext === 'heif' ? 'image/heif' : 'image/jpeg';
    const a = validateAttachment({ kind, uri: file.uri, name, mime, bytes: await fileBytes(file.uri, file.fileSize) });
    return { ...a, uri: await retainMedia(a.uri) };
}
export async function shareAttachment(a: Attachment) {
    validateAttachment(a);
    if (!requireOptionalNativeModule('ExpoSharing'))
        throw new Error('Install the new development build containing expo-sharing.');
    const sharing = require('expo-sharing') as typeof import('expo-sharing');
    if (!await sharing.isAvailableAsync())
        throw new Error('Sharing is unavailable on this device.');
    if (!a.uri.startsWith('file://'))
        throw new Error('Download this attachment securely before opening it.');
    await sharing.shareAsync(a.uri, { mimeType: a.mime, dialogTitle: a.name });
}
