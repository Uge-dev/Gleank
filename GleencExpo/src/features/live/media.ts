import { Platform } from 'react-native';
import { api } from '@/services/api';
import { pickLibrary } from '@/features/media/picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
let privateCacheGeneration = 0;
export type Uploaded = {
    id: string;
    kind: string;
    mimeType: string;
    bytes: number;
    url: string | null;
};
export async function uploadFile(uri: string, name: string, type: string, kind: string): Promise<Uploaded> {
    const form = new FormData();
    form.append('kind', kind);
    if (Platform.OS === 'web') {
        const response = await fetch(uri);
        if (!response.ok)
            throw new Error('The selected file is unavailable.');
        form.append('file', await response.blob(), name);
    }
    else
        form.append('file', { uri, name, type } as unknown as Blob);
    return api.media.upload(form);
}
export async function pickUpload(kind: 'image' | 'video' | 'avatar' | 'cover' | 'review' | 'receipt' | 'chat_image' | 'evidence') {
    const selected = await pickLibrary(kind === 'video' ? 'videos' : 'images', 1);
    if (!selected.length)
        return null;
    const item = selected[0] as {
        uri: string;
        fileName?: string;
        mimeType?: string;
    };
    return uploadFile(item.uri, item.fileName || (kind === 'video' ? 'video.mp4' : 'image.jpg'), item.mimeType || (kind === 'video' ? 'video/mp4' : 'image/jpeg'), kind);
}
export async function pickDocument(kind: 'digital' | 'document') {
    const result = await DocumentPicker.getDocumentAsync({ type: kind === 'digital' ? ['application/pdf', 'application/zip', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'] : ['application/pdf', 'image/jpeg', 'image/png'], copyToCacheDirectory: true, multiple: false });
    if (result.canceled)
        return null;
    const file = result.assets[0];
    return uploadFile(file.uri, file.name, file.mimeType || 'application/octet-stream', kind);
}
export async function saveBlob(blob: Blob, name: string) {
    const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'download';
    if (Platform.OS === 'web') {
        const url = URL.createObjectURL(blob), anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = safe;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        return;
    }
    if (!FileSystem.cacheDirectory)
        throw new Error('Device file storage is unavailable.');
    const base64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('Could not read the download.')); reader.readAsDataURL(blob); });
    const folder = FileSystem.cacheDirectory + 'gleenc-private/';
    await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
    const uri = folder + Date.now() + '-' + safe;
    await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
    if (await Sharing.isAvailableAsync())
        await Sharing.shareAsync(uri, { mimeType: blob.type });
    else
        throw new Error('File sharing is unavailable on this device.');
}
export async function cachePrivateBlob(blob: Blob, name: string): Promise<string> {
    const generation = privateCacheGeneration;
    if (Platform.OS === 'web')
        return URL.createObjectURL(blob);
    if (!FileSystem.cacheDirectory)
        throw new Error('Device storage is unavailable.');
    const folder = FileSystem.cacheDirectory + 'gleenc-private/';
    await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
    const encoded = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1]); r.onerror = () => reject(new Error('Could not read the attachment.')); r.readAsDataURL(blob); });
    const uri = folder + name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
    await FileSystem.writeAsStringAsync(uri, encoded, { encoding: FileSystem.EncodingType.Base64 });
    if (generation !== privateCacheGeneration) {
        await FileSystem.deleteAsync(uri, { idempotent: true });
        throw new Error('Your sign-in changed. Reload this attachment.');
    }
    return uri;
}
export async function clearPrivateCache() { privateCacheGeneration++; if (Platform.OS !== 'web' && FileSystem.cacheDirectory)
    await FileSystem.deleteAsync(FileSystem.cacheDirectory + 'gleenc-private/', { idempotent: true }); }
