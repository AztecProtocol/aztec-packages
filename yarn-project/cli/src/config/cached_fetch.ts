import { createLogger } from '@aztec/aztec.js/log';

import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname } from 'path';

export interface CachedFetchOptions {
  /** The cache file path for storing data. If not provided, no caching is performed. */
  cacheFile?: string;
  /** Fallback max-age in milliseconds when server sends no Cache-Control header. Defaults to 5 minutes. */
  defaultMaxAgeMs?: number;
}

/** Cache metadata stored in a sidecar .meta file alongside the data file. */
interface CacheMeta {
  etag?: string;
  expiresAt: number;
}

const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

/** Extracts max-age value in milliseconds from a Response's Cache-Control header. Returns undefined if not present. */
export function parseMaxAge(response: { headers: { get(name: string): string | null } }): number | undefined {
  const cacheControl = response.headers.get('cache-control');
  if (!cacheControl) {
    return undefined;
  }
  const match = cacheControl.match(/max-age=(\d+)/);
  if (!match) {
    return undefined;
  }
  return parseInt(match[1], 10) * 1000;
}

/**
 * Fetches data from a URL with file-based HTTP conditional caching.
 *
 * Data is stored as raw JSON in the cache file (same format as the server returns).
 * Caching metadata (ETag, expiry) is stored in a separate sidecar `.meta` file.
 * This keeps the data file human-readable and backward-compatible with older code.
 *
 * @param url - The URL to fetch from
 * @param options - Caching options
 * @param fetch - Fetch implementation (defaults to globalThis.fetch)
 * @param log - Logger instance
 * @returns The fetched and parsed JSON data, or undefined if fetch fails
 */
export async function cachedFetch<T = any>(
  url: string,
  options: CachedFetchOptions,
  fetch = globalThis.fetch,
  log = createLogger('cached_fetch'),
): Promise<T | undefined> {
  const { cacheFile, defaultMaxAgeMs = DEFAULT_MAX_AGE_MS } = options;

  // If no cacheFile, just fetch normally without caching
  if (!cacheFile) {
    return fetchAndParse<T>(url, fetch, log);
  }

  const metaFile = cacheFile + '.meta';

  // Try to read metadata
  let meta: CacheMeta | undefined;
  try {
    meta = JSON.parse(await readFile(metaFile, 'utf-8'));
  } catch {
    log.trace('No usable cache metadata found');
  }

  // Try to read cached data
  let cachedData: T | undefined;
  try {
    cachedData = JSON.parse(await readFile(cacheFile, 'utf-8'));
  } catch {
    log.trace('No usable cached data found');
  }

  // If metadata and data exist and cache is fresh, return directly
  if (meta && cachedData !== undefined && meta.expiresAt > Date.now()) {
    return cachedData;
  }

  // Cache is stale or missing — make a (possibly conditional) request
  try {
    const headers: Record<string, string> = {};
    if (meta?.etag && cachedData !== undefined) {
      headers['If-None-Match'] = meta.etag;
    }

    const response = await fetch(url, { headers });

    if (response.status === 304 && cachedData !== undefined) {
      // Not modified — recompute expiry from new response headers and return cached data
      const maxAgeMs = parseMaxAge(response) ?? defaultMaxAgeMs;
      await writeMetaFile(metaFile, { etag: meta?.etag, expiresAt: Date.now() + maxAgeMs }, log);
      return cachedData;
    }

    if (!response.ok) {
      log.warn(`Failed to fetch from ${url}: ${response.status} ${response.statusText}`);
      return cachedData;
    }

    // 200 — parse new data and cache it
    const data = (await response.json()) as T;
    const maxAgeMs = parseMaxAge(response) ?? defaultMaxAgeMs;
    const etag = response.headers.get('etag') ?? undefined;

    await ensureDir(cacheFile, log);
    await Promise.all([
      writeFile(cacheFile, JSON.stringify(data), 'utf-8'),
      writeFile(metaFile, JSON.stringify({ etag, expiresAt: Date.now() + maxAgeMs }), 'utf-8'),
    ]);

    return data;
  } catch (err) {
    log.warn(`Failed to fetch from ${url}`, { err });
    return cachedData;
  }
}

async function fetchAndParse<T>(
  url: string,
  fetch: typeof globalThis.fetch,
  log: ReturnType<typeof createLogger>,
): Promise<T | undefined> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      log.warn(`Failed to fetch from ${url}: ${response.status} ${response.statusText}`);
      return undefined;
    }
    return (await response.json()) as T;
  } catch (err) {
    log.warn(`Failed to fetch from ${url}`, { err });
    return undefined;
  }
}

async function ensureDir(filePath: string, log: ReturnType<typeof createLogger>) {
  try {
    await mkdir(dirname(filePath), { recursive: true });
  } catch (err) {
    log.warn('Failed to create cache directory for: ' + filePath, { err });
  }
}

async function writeMetaFile(metaFile: string, meta: CacheMeta, log: ReturnType<typeof createLogger>) {
  try {
    await mkdir(dirname(metaFile), { recursive: true });
    await writeFile(metaFile, JSON.stringify(meta), 'utf-8');
  } catch (err) {
    log.warn('Failed to write cache metadata: ' + metaFile, { err });
  }
}
