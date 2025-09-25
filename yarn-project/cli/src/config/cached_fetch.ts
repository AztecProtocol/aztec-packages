import { createLogger } from '@aztec/aztec.js';

import { mkdir, readFile, stat, writeFile } from 'fs/promises';
import { dirname } from 'path';

export interface CachedFetchOptions {
  /** Cache duration in milliseconds */
  cacheDurationMs: number;
  /** The cache file */
  cacheFile?: string;
}

/**
 * Fetches data from a URL with file-based caching support.
 * This utility can be used by both remote config and bootnodes fetching.
 *
 * @param url - The URL to fetch from
 * @param networkName - Network name for cache directory structure
 * @param options - Caching and error handling options
 * @param cacheDir - Optional cache directory (defaults to no caching)
 * @returns The fetched and parsed JSON data, or undefined if fetch fails and throwOnError is false
 */
export async function cachedFetch<T = any>(
  url: string,
  options: CachedFetchOptions,
  fetch = globalThis.fetch,
  log = createLogger('cached_fetch'),
): Promise<T | undefined> {
  const { cacheDurationMs, cacheFile } = options;

  // Try to read from cache first
  try {
    if (cacheFile) {
      const info = await stat(cacheFile);
      if (info.mtimeMs + cacheDurationMs > Date.now()) {
        const cachedData = JSON.parse(await readFile(cacheFile, 'utf-8'));
        return cachedData;
      }
    }
  } catch {
    log.trace('Failed to read data from cache');
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      log.warn(`Failed to fetch from ${url}: ${response.status} ${response.statusText}`);
      return undefined;
    }

    const data = await response.json();

    try {
      if (cacheFile) {
        await mkdir(dirname(cacheFile), { recursive: true });
        await writeFile(cacheFile, JSON.stringify(data), 'utf-8');
      }
    } catch (err) {
      log.warn('Failed to cache data on disk: ' + cacheFile, { cacheFile, err });
    }

    return data;
  } catch (err) {
    log.warn(`Failed to fetch from ${url}`, { err });
    return undefined;
  }
}
