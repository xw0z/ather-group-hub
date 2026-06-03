/**
 * Tiny in-memory cache with request deduplication for the Swap dashboard.
 *
 * Why: each tab in the dashboard mounts/unmounts on tab switch and triggers
 * its own `useEffect` fetch. Without caching, navigating between tabs (and
 * back) re-fetches the same data over and over, which feels slow.
 *
 * This cache:
 *  - serves fresh data from memory while it is still within `ttl`
 *  - deduplicates concurrent in-flight requests for the same key
 *  - lets mutation handlers explicitly invalidate keys
 */

type Entry = {
  data: unknown;
  ts: number;
  inflight?: Promise<unknown>;
};

const cache = new Map<string, Entry>();

const DEFAULT_TTL = 30_000;

export async function cached<T>(
  key: string,
  fn: () => Promise<T>,
  ttl: number = DEFAULT_TTL,
): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit?.inflight) return hit.inflight as Promise<T>;
  if (hit && now - hit.ts < ttl) return hit.data as T;

  let p!: Promise<T>;
  p = (async () => {
    try {
      const data = await fn();
      cache.set(key, { data, ts: Date.now() });
      return data;
    } catch (e) {
      const cur = cache.get(key);
      if (cur?.inflight === p) {
        if (cur.ts > 0) cache.set(key, { data: cur.data, ts: cur.ts });
        else cache.delete(key);
      }
      throw e;
    }
  })();

  cache.set(key, { data: hit?.data, ts: hit?.ts ?? 0, inflight: p });
  return p;
}

export function invalidate(...keys: string[]) {
  if (keys.length === 0) {
    cache.clear();
    return;
  }
  for (const k of keys) cache.delete(k);
}

export const CK = {
  clients: "swap:clients",
  todayFees: "swap:todayFees",
  activity: "swap:activity",
  margin: "swap:marginHistory",
  users: "swap:users",
  settings: "swap:settings",
  reports: "swap:reportHistory",
} as const;
