import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/services/api';
import { getApiErrorMessage } from '@/services/api-client';
import { mapRemotePage } from './remote-feed';
import type { FeedItem } from './data';
export type RemoteFeedMode = 'latest' | 'following' | 'hot' | 'vendors';
export function useRemoteFeed(enabled: boolean, ownerId: string | undefined, ready: boolean) {
  const [mode, setMode] = useState<RemoteFeedMode>('hot');
  const key = `${ownerId ?? 'guest'}:${mode}`;
  const [state, setState] = useState({ key, items: [] as FeedItem[], loading: false, loadingMore: false, error: '', nextOffset: null as number | null });
  const epoch = useRef(0), busy = useRef(false), offset = useRef<number | null>(null);
  const controller = useRef<AbortController | null>(null);
  const fetchPage = useCallback(async (reset: boolean) => {
    if (!enabled || !ready || (!reset && (busy.current || offset.current === null))) return;
    if (reset) { epoch.current++; controller.current?.abort(); }
    const current = epoch.current;
    busy.current = true;
    const abort = new AbortController(); controller.current = abort;
    const start = reset ? 0 : offset.current!;
    setState(previous => ({ ...previous, key, loading: reset, loadingMore: !reset, error: '', ...(previous.key === key ? {} : { items: [], nextOffset: null }) }));
    try {
      const page = mapRemotePage(await api.request(`/feed?mode=${mode}&limit=20&offset=${start}`, { signal: abort.signal }));
      if (current !== epoch.current || abort.signal.aborted) return;
      offset.current = page.nextOffset;
      setState(previous => {
        const items = reset ? page.items : [...previous.items, ...page.items];
        const unique = [...new Map(items.map(item => [item.id, item])).values()];
        return { key, items: unique, loading: false, loadingMore: false, error: '', nextOffset: page.nextOffset };
      });
    } catch (error) {
      if (current !== epoch.current || abort.signal.aborted) return;
      setState(previous => ({ ...previous, loading: false, loadingMore: false, error: getApiErrorMessage(error) }));
    } finally { if (current === epoch.current) busy.current = false; }
  }, [enabled, key, mode, ready]);
  useEffect(() => {
    offset.current = null;
    void fetchPage(true);
    return () => { epoch.current++; controller.current?.abort(); busy.current = false; };
  }, [fetchPage]);
  const visible = state.key === key ? state : { ...state, items: [], error: '', nextOffset: null, loading: enabled && ready };
  return { ...visible, mode, setMode, refresh: () => fetchPage(true), loadMore: () => fetchPage(false) };
}
