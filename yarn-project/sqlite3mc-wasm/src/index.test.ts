import type { SqlValue } from '@sqlite.org/sqlite-wasm';
import { readFile } from 'node:fs/promises';

import sqlite3InitModule, { type Sqlite3Static } from './index.js';

/**
 * These are regression tests that simulate a bundled app: `sqlite3.wasm` is NOT fetchable relative to the module's
 * `import.meta.url` (bundlers relocate chunks, so the wasm asset never sits next to them), which is why callers must
 * supply the wasm through the standard Emscripten options `wasmBinary` or `locateFile`. The vendored sqlite3mc build
 * routes those options through `globalThis.sqlite3InitModuleState`, a handoff that never forwards `wasmBinary` and is
 * deleted after the first init call, so the wrapper in index.ts we're testing here must compensate for both.
 */
describe('sqlite3InitModule', () => {
  const BUNDLED_WASM_URL = 'https://bundled.example/assets/sqlite3-4f2a.wasm';
  const realFetch = globalThis.fetch;
  let wasmBinary: Uint8Array<ArrayBuffer>;
  let fetchCalls: string[];

  beforeAll(async () => {
    // Copy into a fresh Uint8Array so the bytes are plain-ArrayBuffer-backed (BufferSource), not a Buffer.
    wasmBinary = new Uint8Array(await readFile(new URL('../vendor/jswasm/sqlite3.wasm', import.meta.url)));
  });

  beforeEach(() => {
    fetchCalls = [];
    globalThis.fetch = ((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      fetchCalls.push(url);
      if (url === BUNDLED_WASM_URL) {
        return Promise.resolve(new Response(wasmBinary, { headers: { 'content-type': 'application/wasm' } }));
      }
      return Promise.reject(new Error(`unexpected fetch of ${url}: the wasm is not addressable by URL when bundled`));
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  /**
   * The wrapper's built-in load paths reject on failure, but a regression (or a caller-supplied `instantiateWasm`,
   * whose failures Emscripten's hook contract cannot report) hangs forever, so bound the wait and fail with the
   * observed fetch calls as evidence instead of hitting the jest timeout.
   */
  const settleWithin = <T>(promise: Promise<T>, ms = 20_000): Promise<T> =>
    Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(`sqlite3InitModule did not settle within ${ms}ms; fetch calls: ${JSON.stringify(fetchCalls)}`),
            ),
          ms,
        ),
      ),
    ]);

  const expectWorkingDb = (sqlite3: Sqlite3Static) => {
    // Open a disposable in-memory SQLite
    const db = new sqlite3.oo1.DB(':memory:');
    try {
      db.exec('CREATE TABLE t(a INTEGER); INSERT INTO t VALUES (40), (2);');
      const rows: SqlValue[][] = [];
      db.exec({ sql: 'SELECT SUM(a) FROM t', rowMode: 'array', resultRows: rows });
      expect(rows).toEqual([[42]]);
    } finally {
      db.close();
    }
  };

  it('resolves the wasm via a bundler-visible static URL on a bare first call', async () => {
    // Must match the literal `new URL('../vendor/jswasm/sqlite3.wasm', import.meta.url)` in src/index.ts, the static
    // form bundlers detect and rewrite. This test file sits next to index.ts, so the same expression yields the URL
    // the wrapper must produce.
    const expectedUrl = new URL('../vendor/jswasm/sqlite3.wasm', import.meta.url).href;
    globalThis.fetch = ((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      fetchCalls.push(url);
      if (url === expectedUrl) {
        return Promise.resolve(new Response(wasmBinary, { headers: { 'content-type': 'application/wasm' } }));
      }
      return Promise.reject(new Error(`unexpected fetch of ${url}`));
    }) as typeof fetch;

    // In this unbundled test env the vendored fallback (`new URL(path, import.meta.url)` relative to sqlite3.mjs)
    // resolves to the same file URL as the static default, so the fetched URL alone cannot distinguish them. Capture
    // the state object the wrapper installs to assert the resolution came from an installed locateFile, which is the
    // only mechanism bundlers can rewrite.
    let installedState: Record<string, unknown> | undefined;
    let stateSlot: unknown;
    Object.defineProperty(globalThis, 'sqlite3InitModuleState', {
      configurable: true,
      get: () => stateSlot,
      set: value => {
        installedState = value as Record<string, unknown>;
        stateSlot = value;
      },
    });
    try {
      const sqlite3 = await settleWithin(sqlite3InitModule());
      expectWorkingDb(sqlite3);
      expect(fetchCalls).toEqual([expectedUrl]);
      const locate = installedState?.emscriptenLocateFile as ((path: string, prefix: string) => string) | undefined;
      expect(typeof locate).toBe('function');
      expect(locate!('sqlite3.wasm', '')).toBe(expectedUrl);
    } finally {
      delete (globalThis as { sqlite3InitModuleState?: unknown }).sqlite3InitModuleState;
    }
  });

  it('honors wasmBinary on the first call instead of fetching the wasm by URL', async () => {
    const sqlite3 = await settleWithin(sqlite3InitModule({ wasmBinary }));
    expect(fetchCalls).toEqual([]);
    expectWorkingDb(sqlite3);
  });

  it('honors locateFile on the first call', async () => {
    const locateCalls: string[] = [];
    const sqlite3 = await settleWithin(
      sqlite3InitModule({
        locateFile: (path: string) => {
          locateCalls.push(path);
          return BUNDLED_WASM_URL;
        },
      }),
    );
    expect(locateCalls).toEqual(['sqlite3.wasm']);
    expect(fetchCalls).toEqual([BUNDLED_WASM_URL]);
    expectWorkingDb(sqlite3);
  });

  it('rejects when the wasm cannot be fetched', async () => {
    // Bare call: the default locateFile resolves a file:// URL, which the stub rejects like a bundled app whose asset
    // pipeline is broken.
    await expect(settleWithin(sqlite3InitModule(), 5_000)).rejects.toThrow(/sqlite3 wasm instantiation failed/);
  });

  it('rejects with the HTTP status when the wasm URL returns an error response', async () => {
    globalThis.fetch = ((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      fetchCalls.push(url);
      return Promise.resolve(new Response('not found', { status: 404, statusText: 'Not Found' }));
    }) as typeof fetch;
    await expect(settleWithin(sqlite3InitModule({ locateFile: () => BUNDLED_WASM_URL }), 5_000)).rejects.toThrow(
      /HTTP 404/,
    );
  });

  it('rejects on corrupt wasmBinary bytes', async () => {
    await expect(settleWithin(sqlite3InitModule({ wasmBinary: new Uint8Array([0, 1, 2, 3]) }), 5_000)).rejects.toThrow(
      /sqlite3 wasm instantiation failed \(wasmBinary\)/,
    );
  });

  it('keeps honoring caller options on calls after the first', async () => {
    await settleWithin(sqlite3InitModule({ wasmBinary }));
    const locateCalls: string[] = [];
    const sqlite3 = await settleWithin(
      sqlite3InitModule({
        locateFile: (path: string) => {
          locateCalls.push(path);
          return BUNDLED_WASM_URL;
        },
      }),
    );
    expect(locateCalls).toEqual(['sqlite3.wasm']);
    expect(fetchCalls).toEqual([BUNDLED_WASM_URL]);
    expectWorkingDb(sqlite3);
  });
});
