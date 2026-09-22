import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from '../db/database.js';
import { env } from '../config/env.js';
import { HttpError } from '../lib/http-error.js';
import { requireAuth, requireEmailVerified } from '../middleware/auth.js';
import { isCloudinaryEnabled, uploadCloudinaryBuffer, destroyCloudinaryAsset } from '../services/cloudinary.service.js';
export const socialRouter = Router();
const inputSchema = z.object({ caption: z.string().trim().min(1).max(2000), productId: z.string().max(100).default('') });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024, files: 1, fields: 2 } }).single('video');
// Header checks reject disguised HTML/images; Cloudinary also decodes production uploads.
export function videoType(buffer) {
    if (buffer?.length >= 16 && buffer.toString('ascii', 4, 8) === 'ftyp' &&
        /^(isom|iso[2-9]|mp4[12]|avc1|M4V )$/.test(buffer.toString('ascii', 8, 12)))
        return 'mp4';
    if (buffer?.length >= 16 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) &&
        buffer.subarray(0, 256).includes(Buffer.from('webm')))
        return 'webm';
    throw new HttpError(415, 'Choose a valid MP4 or WebM video (up to 30 MB).');
}
socialRouter.get('/posts', (req, res) => {
    const userId = z.string().max(100).parse(req.query.userId || '');
    const before = z.string().max(150).parse(req.query.before || '');
    const rows = db.prepare(`SELECT p.*, a.username, a.display_name, u.name, l.id AS referral_id, l.mode,
    products.name AS product_name, products.price_kobo, products.image_urls,
    CASE WHEN products.status='active' AND stores.status='active' THEN 1 ELSE 0 END AS product_available
    FROM social_posts p JOIN users u ON u.id=p.user_id
    LEFT JOIN account_profiles a ON a.user_id=p.user_id
    LEFT JOIN products ON products.id=p.product_id
    LEFT JOIN stores ON stores.id=products.store_id
    LEFT JOIN earning_links l ON l.id=p.id
    WHERE p.status='active' AND (?='' OR p.user_id=?)
    AND (?='' OR p.created_at || ':' || p.id < ?)
    ORDER BY p.created_at DESC,p.id DESC LIMIT 50`).all(userId, userId, before, before);
    const posts = rows.map(p => ({ id: p.id, userId: p.user_id, username: p.username || '',
        author: p.display_name || p.name, caption: p.caption, videoUrl: p.video_url,
        createdAt: p.created_at, productId: p.product_available ? p.product_id : null,
        productName: p.product_name, productPrice: p.price_kobo / 100,
        imageUrl: JSON.parse(p.image_urls || '[]')[0] || '', referralId: p.referral_id || '', mode: p.mode || '' }));
    res.json({ posts, next: rows.length === 50 ? rows.at(-1).created_at + ':' + rows.at(-1).id : null });
});
socialRouter.post('/posts', requireAuth, requireEmailVerified, rateLimit({ windowMs: 60 * 60 * 1000, limit: 10 }), upload, async (req, res) => {
    const input = inputSchema.parse(req.body);
    if (!req.file)
        throw new HttpError(422, 'Select a video to upload.');
    const extension = videoType(req.file.buffer);
    if (input.productId && !db.prepare(`SELECT products.id FROM products JOIN stores ON stores.id=products.store_id
      WHERE products.id=? AND products.status='active' AND stores.status='active'`).get(input.productId))
        throw new HttpError(422, 'Choose a published product to tag.');
    const id = crypto.randomUUID();
    let videoUrl, publicId, localPath;
    try {
        if (isCloudinaryEnabled()) {
            const result = await uploadCloudinaryBuffer(req.file.buffer, { resourceType: 'video', folder: env.cloudinaryFolder + '/videos', publicId: id });
            publicId = result.public_id;
            videoUrl = result.secure_url;
        }
        else {
            await fs.mkdir(env.uploadsPath, { recursive: true });
            localPath = path.join(env.uploadsPath, id + '.' + extension);
            await fs.writeFile(localPath, req.file.buffer);
            videoUrl = '/uploads/' + id + '.' + extension;
        }
        db.prepare(`INSERT INTO social_posts(id,user_id,caption,video_url,product_id,created_at)
        VALUES(?,?,?,?,?,?)`).run(id, req.auth.user_id, input.caption, videoUrl, input.productId || null, new Date().toISOString());
        res.status(201).json({ id });
    }
    catch (error) {
        if (publicId)
            destroyCloudinaryAsset(publicId, 'video');
        if (localPath)
            await fs.rm(localPath, { force: true });
        throw error;
    }
});
socialRouter.delete('/posts/:id', requireAuth, (req, res) => {
    const post = db.prepare('SELECT user_id FROM social_posts WHERE id=?').get(req.params.id);
    if (!post)
        throw new HttpError(404, 'Post not found.');
    if (post.user_id !== req.auth.user_id && req.auth.role !== 'admin')
        throw new HttpError(403, 'You cannot remove this post.');
    db.prepare("UPDATE social_posts SET status='removed' WHERE id=?").run(req.params.id);
    res.json({ message: 'Post removed from feeds.' });
});
