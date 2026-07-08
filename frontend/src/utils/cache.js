// utils/cache.js — Tiny in-memory TTL cache for API responses.
//
// Rationale: regions and cuisines on /api/restaurants/* change rarely. Without
// this cache, every filter interaction on FoodPage triggers a fresh `/regions`
// and `/cuisines` round-trip. With it, those endpoints are hit at most once
// per TTL window per tab.
//
// Design constraints:
// - Per-tab only. There is no cross-tab persistence. Persistent caching is a
//   service-worker / IndexedDB concern, out of scope here.
// - LRU is not implemented — the cache is bounded by entry count, not bytes.
//   We cap at MAX_ENTRIES to prevent unbounded growth from a key explosion.
// - A failed fetch is NOT cached. The promise rejection propagates to the
//   caller; a fresh attempt will run on the next call.

const store = new Map();
const MAX_ENTRIES = 200;

/**
 * Run a fetcher and cache its resolved value for `ttlMs`.
 *
 * @param {string} key - Cache key. Callers are responsible for including
 *   any input variation (e.g. `regions:ghana`).
 * @param {() => Promise<any>} fetcher - Async function that does the work.
 * @param {number} [ttlMs=300000] - TTL in ms. Default 5 min.
 * @returns {Promise<any>} - The cached or freshly-fetched value.
 */
export function cachedFetch(key, fetcher, ttlMs = 5 * 60_000) {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expires > now) {
    return Promise.resolve(hit.value);
  }

  return fetcher().then((value) => {
    // Trim oldest entries when we exceed the cap. We delete the first key in
    // Map insertion order, which is the oldest by convention.
    if (store.size >= MAX_ENTRIES) {
      const oldestKey = store.keys().next().value;
      if (oldestKey !== undefined) store.delete(oldestKey);
    }
    store.set(key, { value, expires: now + ttlMs });
    return value;
  });
}

/**
 * Invalidate a single key (or a key prefix). Use after a mutation that
 * would change a cached value (e.g. admin adds a new cuisine).
 *
 * @param {string} keyOrPrefix - Exact key, or a prefix to invalidate.
 * @param {object} [opts]
 * @param {boolean} [opts.prefix=false] - Treat the arg as a prefix.
 */
export function invalidate(keyOrPrefix, { prefix = false } = {}) {
  if (!prefix) {
    store.delete(keyOrPrefix);
    return;
  }
  for (const k of store.keys()) {
    if (k.startsWith(keyOrPrefix)) store.delete(k);
  }
}

/** Clear the entire cache. Used by tests; rarely in production. */
export function clearCache() {
  store.clear();
}
