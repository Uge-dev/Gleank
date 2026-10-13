import type { FeedItem } from '@/features/feed/data';
export type ScheduledPost = { id: string; ownerId: string; item: FeedItem; publishAt: number; queuedAt: number };
export const MAX_SCHEDULE_DAYS = 365;
export function validateSchedule(at: number, now = Date.now()) {
  if (!Number.isSafeInteger(at) || at < now + 60000 || at > now + MAX_SCHEDULE_DAYS * 86400000)
    throw new Error('Choose a time at least one minute ahead and within the next year.');
  return at;
}
export function takeDuePosts(queue: ScheduledPost[], ownerId: string, now = Date.now()) {
  const due = queue.filter(p => p.ownerId === ownerId && p.publishAt <= now);
  return { due, remaining: queue.filter(p => !due.some(d => d.id === p.id)) };
}
export function scheduleLabel(at: number) {
  return new Date(at).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
}
