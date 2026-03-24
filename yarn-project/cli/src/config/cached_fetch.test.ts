import { jest } from '@jest/globals';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { cachedFetch, parseMaxAge } from './cached_fetch.js';

describe('cachedFetch', () => {
  let tempDir: string;
  let cacheFile: string;
  let metaFile: string;
  let mockFetch: jest.Mock<typeof fetch>;
  const noopLog: any = { trace: () => {}, warn: () => {}, info: () => {} };

  beforeEach(async () => {
    tempDir = join(tmpdir(), `cached-fetch-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tempDir, { recursive: true });
    cacheFile = join(tempDir, 'cache.json');
    metaFile = cacheFile + '.meta';
    mockFetch = jest.fn();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function mockResponse(body: any, init?: { status?: number; headers?: Record<string, string> }): Response {
    const status = init?.status ?? 200;
    const headers = new Headers(init?.headers ?? {});
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 304 ? 'Not Modified' : 'OK',
      headers,
      json: () => Promise.resolve(body),
    } as Response;
  }

  async function writeCacheFiles(data: any, opts?: { etag?: string; expiresAt?: number }) {
    await writeFile(cacheFile, JSON.stringify(data), 'utf-8');
    await writeFile(
      metaFile,
      JSON.stringify({ etag: opts?.etag, expiresAt: opts?.expiresAt ?? Date.now() + 60_000 }),
      'utf-8',
    );
  }

  it('returns cached data without fetching when cache is fresh', async () => {
    const data = { key: 'cached-value' };
    await writeCacheFiles(data, { expiresAt: Date.now() + 60_000 });

    const result = await cachedFetch('https://example.com/data.json', { cacheFile }, mockFetch, noopLog);

    expect(result).toEqual(data);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sends conditional request with If-None-Match when cache is stale and has ETag', async () => {
    const data = { key: 'stale-value' };
    await writeCacheFiles(data, { etag: '"abc123"', expiresAt: Date.now() - 1000 });

    mockFetch.mockResolvedValue(
      mockResponse(null, {
        status: 304,
        headers: { 'cache-control': 'max-age=300' },
      }),
    );

    const result = await cachedFetch('https://example.com/data.json', { cacheFile }, mockFetch, noopLog);

    expect(result).toEqual(data);
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/data.json', {
      headers: { 'If-None-Match': '"abc123"' },
    });

    // Data file should be unchanged
    expect(JSON.parse(await readFile(cacheFile, 'utf-8'))).toEqual(data);
    // Meta file should have updated expiry
    const meta = JSON.parse(await readFile(metaFile, 'utf-8'));
    expect(meta.expiresAt).toBeGreaterThan(Date.now());
  });

  it('returns new data and stores ETag on 200 response', async () => {
    const staleData = { key: 'old' };
    const freshData = { key: 'new' };
    await writeCacheFiles(staleData, { etag: '"old-etag"', expiresAt: Date.now() - 1000 });

    mockFetch.mockResolvedValue(
      mockResponse(freshData, {
        status: 200,
        headers: { etag: '"new-etag"', 'cache-control': 'max-age=600' },
      }),
    );

    const result = await cachedFetch('https://example.com/data.json', { cacheFile }, mockFetch, noopLog);

    expect(result).toEqual(freshData);

    // Data file should have new data (raw JSON)
    expect(JSON.parse(await readFile(cacheFile, 'utf-8'))).toEqual(freshData);
    // Meta file should have new ETag and expiry
    const meta = JSON.parse(await readFile(metaFile, 'utf-8'));
    expect(meta.etag).toBe('"new-etag"');
    expect(meta.expiresAt).toBeGreaterThan(Date.now());
  });

  it('fetches normally without caching when no cacheFile is provided', async () => {
    const data = { key: 'no-cache' };
    mockFetch.mockResolvedValue(mockResponse(data));

    const result = await cachedFetch('https://example.com/data.json', {}, mockFetch, noopLog);

    expect(result).toEqual(data);
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/data.json');
  });

  it('falls back to normal fetch when metadata file is missing', async () => {
    // Write only data file, no meta file (simulates upgrade from old code)
    await writeFile(cacheFile, JSON.stringify({ key: 'old-format' }), 'utf-8');

    const freshData = { key: 'fresh' };
    mockFetch.mockResolvedValue(
      mockResponse(freshData, {
        status: 200,
        headers: { 'cache-control': 'max-age=300' },
      }),
    );

    const result = await cachedFetch('https://example.com/data.json', { cacheFile }, mockFetch, noopLog);

    expect(result).toEqual(freshData);
    // Should have fetched without If-None-Match since no meta
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/data.json', { headers: {} });
  });

  it('falls back to normal fetch when metadata file is corrupt', async () => {
    await writeFile(cacheFile, JSON.stringify({ key: 'data' }), 'utf-8');
    await writeFile(metaFile, 'not-json!!!', 'utf-8');

    const freshData = { key: 'fresh' };
    mockFetch.mockResolvedValue(
      mockResponse(freshData, {
        status: 200,
        headers: { 'cache-control': 'max-age=300' },
      }),
    );

    const result = await cachedFetch('https://example.com/data.json', { cacheFile }, mockFetch, noopLog);

    expect(result).toEqual(freshData);
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/data.json', { headers: {} });
  });

  it('falls back to normal fetch when data file is missing but metadata exists', async () => {
    await writeFile(metaFile, JSON.stringify({ etag: '"abc"', expiresAt: Date.now() + 60_000 }), 'utf-8');

    const freshData = { key: 'fresh' };
    mockFetch.mockResolvedValue(
      mockResponse(freshData, {
        status: 200,
        headers: { 'cache-control': 'max-age=300' },
      }),
    );

    const result = await cachedFetch('https://example.com/data.json', { cacheFile }, mockFetch, noopLog);

    expect(result).toEqual(freshData);
    // Should not send If-None-Match since data is missing
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/data.json', { headers: {} });
  });

  it('uses defaultMaxAgeMs when server sends no Cache-Control header', async () => {
    const data = { key: 'value' };
    mockFetch.mockResolvedValue(
      mockResponse(data, {
        status: 200,
        headers: { etag: '"some-etag"' },
      }),
    );

    const defaultMaxAgeMs = 120_000; // 2 minutes
    const before = Date.now();
    await cachedFetch('https://example.com/data.json', { cacheFile, defaultMaxAgeMs }, mockFetch, noopLog);

    const meta = JSON.parse(await readFile(metaFile, 'utf-8'));
    expect(meta.expiresAt).toBeGreaterThanOrEqual(before + defaultMaxAgeMs);
    expect(meta.expiresAt).toBeLessThanOrEqual(Date.now() + defaultMaxAgeMs);
  });

  it('returns stale cache data when fetch fails', async () => {
    const data = { key: 'stale-fallback' };
    await writeCacheFiles(data, { expiresAt: Date.now() - 1000 });

    mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await cachedFetch('https://example.com/data.json', { cacheFile }, mockFetch, noopLog);

    expect(result).toEqual(data);
  });

  it('returns stale cache data when server returns non-ok status', async () => {
    const data = { key: 'stale-server-error' };
    await writeCacheFiles(data, { expiresAt: Date.now() - 1000 });

    mockFetch.mockResolvedValue(mockResponse(null, { status: 500 }));

    const result = await cachedFetch('https://example.com/data.json', { cacheFile }, mockFetch, noopLog);

    expect(result).toEqual(data);
  });

  it('returns undefined when fetch fails and no cache exists', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await cachedFetch('https://example.com/data.json', { cacheFile }, mockFetch, noopLog);

    expect(result).toBeUndefined();
  });
});

describe('parseMaxAge', () => {
  it('extracts max-age from Cache-Control header', () => {
    const response = { headers: { get: (name: string) => (name === 'cache-control' ? 'max-age=300' : null) } };
    expect(parseMaxAge(response)).toBe(300_000);
  });

  it('handles max-age with other directives', () => {
    const response = {
      headers: { get: (name: string) => (name === 'cache-control' ? 'public, max-age=600, must-revalidate' : null) },
    };
    expect(parseMaxAge(response)).toBe(600_000);
  });

  it('returns undefined when no Cache-Control header', () => {
    const response = { headers: { get: () => null } };
    expect(parseMaxAge(response)).toBeUndefined();
  });

  it('returns undefined when no max-age in Cache-Control', () => {
    const response = { headers: { get: (name: string) => (name === 'cache-control' ? 'no-cache' : null) } };
    expect(parseMaxAge(response)).toBeUndefined();
  });
});
