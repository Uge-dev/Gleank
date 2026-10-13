import { secureId } from '@/features/account/guards';
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { uri } from '@/features/marketplace/domain';
/** Picker cache files can disappear. Save local selections before queuing posts. */
export async function retainMedia(source: string) {
    uri(source);
    if (source.startsWith('https://') || Platform.OS === 'web')
        return source;
    if (!requireOptionalNativeModule('ExponentFileSystem'))
        throw new Error('Install the new development app containing expo-file-system to save selected media.');
    const files = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
    if (!files.documentDirectory)
        throw new Error('Device media storage is unavailable.');
    const folder = files.documentDirectory + 'gleenc-media/';
    if (source.startsWith(folder))
        return source;
    await files.makeDirectoryAsync(folder, { intermediates: true });
    const suffix = source.split('?')[0].match(/\.([a-zA-Z0-9]{1,8})$/)?.[1] || 'media';
    const target = folder + secureId('MEDIA') + '.' + suffix;
    await files.copyAsync({ from: source, to: target });
    return target;
}
