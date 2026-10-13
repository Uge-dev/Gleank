import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { retainMedia } from '@/features/media/retain-media';
import { integer, text, uri } from '@/features/marketplace/domain';
import { secureId } from '@/features/account/guards';
export type FileMetadata = {
    id: string;
    name: string;
    bytes: number;
    mime: string;
};
export type PrivateFile = FileMetadata & {
    ownerId: string;
    uri: string;
};
export type DigitalDetails = {
    files: FileMetadata[];
    licence: 'personal' | 'commercial';
    licenceText: string;
    requirements: string;
    version: string;
};
const types: Record<string, string> = { pdf: 'application/pdf', zip: 'application/zip', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', txt: 'text/plain', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
export const fileSize = (bytes: number) => bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.ceil(bytes / 1024) + ' KB';
export function validateFile(file: FileMetadata) {
    if (!text(file.id) || !text(file.name, 140))
        throw new Error('Complete file metadata.');
    integer(file.bytes, 1, 50 * 1024 * 1024, 'file size');
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!types[ext] || types[ext] !== file.mime || /[\\/\u0000]/.test(file.name))
        throw new Error('Use a PDF, Office file, ZIP, text file or image, up to 50 MB.');
    return file;
}
export function validateDigital(d: DigitalDetails) {
    if (!d || !Array.isArray(d.files) || !d.files.length || d.files.length > 5 || new Set(d.files.map(f => f.id)).size !== d.files.length)
        throw new Error('Attach one to five digital files.');
    d.files.forEach(validateFile);
    if (!['personal', 'commercial'].includes(d.licence))
        throw new Error('Choose a licence.');
    text(d.licenceText, 1000);
    text(d.requirements, 600);
    text(d.version, 40);
    return { files: d.files.map(({ id, name, bytes, mime }) => ({ id, name, bytes, mime })), licence: d.licence, licenceText: d.licenceText, requirements: d.requirements, version: d.version };
}
export async function pickDigitalFiles(ownerId: string) {
    if (Platform.OS !== 'web' && !requireOptionalNativeModule('ExpoDocumentPicker'))
        throw new Error('Install expo-document-picker and use the new development build to attach digital files.');
    const picker = require('expo-document-picker') as typeof import('expo-document-picker');
    const result = await picker.getDocumentAsync({ type: Object.values(types), copyToCacheDirectory: true, multiple: true });
    if (result.canceled)
        return [];
    if (result.assets.length > 5)
        throw new Error('Select at most five files.');
    const files: PrivateFile[] = [];
    for (const asset of result.assets) {
        const ext = asset.name.split('.').pop()?.toLowerCase() ?? '';
        const file = validateFile({ id: secureId('ASSET'), name: asset.name, bytes: asset.size ?? 0, mime: types[ext] ?? '' });
        files.push({ ...file, ownerId, uri: await retainMedia(uri(asset.uri)) });
    }
    return files;
}
export async function samplePdf(ownerId: string): Promise<PrivateFile> {
    if (!requireOptionalNativeModule('ExponentFileSystem'))
        throw new Error('Install the development build containing expo-file-system.');
    const fs = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
    if (!fs.documentDirectory)
        throw new Error('File storage unavailable.');
    const id = secureId('ASSET'), folder = fs.documentDirectory + 'gleenc-media/';
    await fs.makeDirectoryAsync(folder, { intermediates: true });
    const stream = 'BT /F1 22 Tf 55 740 Td (Gleenc Digital Purchase) Tj 0 -34 Td /F1 12 Tf (Your sample PDF opened successfully.) Tj ET';
    const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((o, i) => {
        offsets.push(pdf.length);
        pdf += (i + 1) + ' 0 obj\n' + o + '\nendobj\n';
    });
    const xref = pdf.length;
    pdf += 'xref\n0 6\n0000000000 65535 f \n' + offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
    const location = folder + id + '.pdf';
    await fs.writeAsStringAsync(location, pdf);
    return { id, ownerId, uri: location, name: 'Gleenc-sample-guide.pdf', mime: 'application/pdf', bytes: pdf.length };
}
export async function openPurchasedFile(file: PrivateFile) {
    validateFile(file);
    if (!file.uri.startsWith('file://'))
        throw new Error('This local purchase file is unavailable. Reattach it from the seller editor.');
    if (!requireOptionalNativeModule('ExponentFileSystem'))
        throw new Error('File storage unavailable in this build.');
    const fs = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
    if (decodeURIComponent(file.uri).split('/').some(part => part === '..' || part === '.') || !fs.documentDirectory || !file.uri.startsWith(fs.documentDirectory + 'gleenc-media/'))
        throw new Error('File is outside the Gleenc media folder.');
    const info = await fs.getInfoAsync(file.uri);
    if (!info.exists)
        throw new Error('This file is no longer stored on the device.');
    if (Platform.OS !== 'web' && !requireOptionalNativeModule('ExpoSharing'))
        throw new Error('Install the development build containing expo-sharing to open purchased files.');
    const sharing = require('expo-sharing') as typeof import('expo-sharing');
    if (!await sharing.isAvailableAsync())
        throw new Error('This device cannot open the file sharing panel.');
    await sharing.shareAsync(file.uri, { mimeType: file.mime, dialogTitle: file.name });
}
