import { apiRequest } from '../lib/api';
export type SocialPost = {
    id: string;
    userId: string;
    username: string;
    author: string;
    caption: string;
    videoUrl: string;
    createdAt: string;
    productId: string | null;
    productName: string;
    productPrice: number;
    imageUrl: string;
    referralId: string;
    mode: string;
};
export const social = {
    posts: (userId = '', before = '') => apiRequest<{
        posts: SocialPost[];
        next: string | null;
    }>(`/social/posts?${new URLSearchParams({ userId, before })}`),
    upload: (body: FormData) => apiRequest<{
        id: string;
    }>('/social/posts', { method: 'POST', body }, 180000),
    remove: (id: string) => apiRequest(`/social/posts/${id}`, { method: 'DELETE' }),
};
