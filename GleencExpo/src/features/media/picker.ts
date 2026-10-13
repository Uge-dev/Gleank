import { permissionHelp } from '@/features/experience/recovery';
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { uri } from '@/features/marketplace/domain';
type Picker = typeof import('expo-image-picker');
export const PICKER_BUILD_MESSAGE = 'Photo picking is not included in this installed app. Install expo-image-picker, build a new development client, and install that completed build on this device.';
let picker: Picker | undefined;
export function getMediaPicker(): Picker {
    // Metro reports missing native modules before a surrounding require catch can
    // suppress its red error screen. Check native availability before importing.
    if (Platform.OS !== 'web' && !requireOptionalNativeModule('ExponentImagePicker'))
        throw new Error(PICKER_BUILD_MESSAGE);
    if (!picker)
        picker = require('expo-image-picker') as Picker;
    return picker;
}
export async function pickLibrary(kind: 'images' | 'videos', limit = 1, crop?: [
    number,
    number
]) {
    const module = getMediaPicker();
    if (Platform.OS === 'ios' && (kind === 'videos' || crop)) {
        const permission = await module.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
            void permissionHelp('Allow Gleenc to access the selected photos or videos in device Settings. You can continue browsing without this permission.');
            throw new Error('Allow photo library access in device Settings to choose this media.');
        }
    }
    const result = await module.launchImageLibraryAsync({ mediaTypes: [kind], allowsMultipleSelection: !crop && kind === 'images' && limit > 1, selectionLimit: Math.max(1, Math.min(8, limit)), allowsEditing: !!crop, ...(crop ? { aspect: crop } : {}), quality: .9 });
    if (result.canceled)
        return [];
    return result.assets.map(asset => {
        if (!asset.uri || (asset.type && asset.type !== (kind === 'images' ? 'image' : 'video')))
            throw new Error('Choose the requested media type.');
        uri(asset.uri);
        if ((asset.fileSize ?? 0) > (kind === 'videos' ? 250 : 25) * 1024 * 1024)
            throw new Error('Choose a smaller file: photos up to 25 MB and videos up to 250 MB.');
        return asset;
    });
}
