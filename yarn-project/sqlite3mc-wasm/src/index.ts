import type { Sqlite3Static } from '@sqlite.org/sqlite-wasm';

import vendoredInit from '../vendor/jswasm/sqlite3.mjs';

export type { Database, SAHPoolUtil, Sqlite3Static } from '@sqlite.org/sqlite-wasm';

/**
 * Bundler-visible static reference to the wasm binary. Because the URL argument is a string literal, bundlers detect
 * the expression, emit the wasm as an asset, and rewrite the URL, so the default `locateFile` below resolves to the
 * emitted asset instead of guessing a path relative to the (relocated) output chunk at runtime.
 */
export const SQLITE3_WASM_URL = new URL('../vendor/jswasm/sqlite3.wasm', import.meta.url);

/**
 * Emscripten module-loader options honored by {@link sqlite3InitModule}. Any further options are passed through to the
 * vendored module unchanged.
 */
export interface Sqlite3InitOptions {
  /** Resolves the URL from which a runtime asset (in practice always `sqlite3.wasm`) is fetched. */
  locateFile?: (path: string, prefix: string) => string;
  /** Pre-fetched wasm bytes. When set, the wasm is instantiated directly and never fetched by URL. */
  wasmBinary?: BufferSource;
  /** Custom wasm instantiation hook (standard Emscripten contract). Takes precedence over `wasmBinary`. */
  instantiateWasm?: (
    imports: WebAssembly.Imports,
    onSuccess: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void,
  ) => object;
  [key: string]: unknown;
}

/**
 * Initializes the sqlite3mc wasm module.
 *
 * With no options, the wasm is fetched from {@link SQLITE3_WASM_URL}, which bundlers rewrite to their emitted asset,
 * so bundled consumers work by default. Pass `locateFile`, `wasmBinary`, or `instantiateWasm` to override.
 *
 * If loading the wasm fails (unreachable URL, HTTP error, corrupt bytes), the returned promise rejects with the cause.
 * Exception: failures inside a caller-supplied `instantiateWasm` cannot be observed (Emscripten's hook contract has no
 * error channel), so with a custom hook the promise never settles on failure.
 */
export default function sqlite3InitModule(options: Sqlite3InitOptions = {}): Promise<Sqlite3Static> {
  return new Promise((resolve, reject) => {
    const instantiateWasm =
      options.instantiateWasm ??
      (options.wasmBinary
        ? wasmBinaryInstantiator(options.wasmBinary, reject)
        : urlInstantiator(options.locateFile ?? defaultLocateFile, reject));
    const callOptions = { ...options, instantiateWasm };
    installInitModuleState(callOptions);
    // The vendored init consumes the installed state synchronously (its pre-js runs before the first await), so
    // interleaved calls cannot observe each other's state. On instantiation failure the vendored promise never
    // settles (the hook has no error channel), so the instantiators report failure through `reject` instead.
    vendoredInit(callOptions).then(resolve, reject);
  });
}

/** Builds an Emscripten `instantiateWasm` hook that instantiates the given bytes instead of fetching by URL. */
function wasmBinaryInstantiator(
  wasmBinary: BufferSource,
  onFailure: (error: Error) => void,
): Required<Sqlite3InitOptions>['instantiateWasm'] {
  return (imports, onSuccess) => {
    void WebAssembly.instantiate(wasmBinary, imports).then(
      ({ instance, module }) => onSuccess(instance, module),
      error => onFailure(instantiationError('wasmBinary', error)),
    );
    return {};
  };
}

/**
 * Builds an Emscripten `instantiateWasm` hook that fetches and instantiates the wasm from the located URL, replacing
 * the vendored fallback (which reports failures nowhere). Prefers streaming compilation, falling back to
 * buffer-based instantiation when streaming is unavailable or fails (e.g. a server responding without the
 * `application/wasm` MIME type, which `instantiateStreaming` rejects).
 */
function urlInstantiator(
  locate: (path: string, prefix: string) => string,
  onFailure: (error: Error) => void,
): Required<Sqlite3InitOptions>['instantiateWasm'] {
  return (imports, onSuccess) => {
    const url = locate('sqlite3.wasm', '');
    const streaming = WebAssembly.instantiateStreaming
      ? WebAssembly.instantiateStreaming(fetch(url, { credentials: 'same-origin' }), imports).catch(() =>
          fetchAndInstantiate(url, imports),
        )
      : fetchAndInstantiate(url, imports);
    void streaming.then(
      ({ instance, module }) => onSuccess(instance, module),
      error => onFailure(instantiationError(url, error)),
    );
    return {};
  };
}

/** Fetches the wasm and instantiates it from a buffer, surfacing HTTP errors that streaming instantiation obscures. */
async function fetchAndInstantiate(
  url: string,
  imports: WebAssembly.Imports,
): Promise<WebAssembly.WebAssemblyInstantiatedSource> {
  const response = await fetch(url, { credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`.trimEnd());
  }
  return WebAssembly.instantiate(await response.arrayBuffer(), imports);
}

function instantiationError(source: string, cause: unknown): Error {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new Error(`sqlite3 wasm instantiation failed (${source}): ${detail}`, { cause });
}

/**
 * Installs the global state object the vendored module's pre-js binds its `Module.locateFile` and
 * `Module.instantiateWasm` wrappers to.
 */
function installInitModuleState(options: Sqlite3InitOptions): void {
  const urlParams = globalThis.location?.href ? new URL(globalThis.location.href).searchParams : new URLSearchParams();
  const debugModule = urlParams.has('sqlite3.debugModule')
    ? // eslint-disable-next-line no-console -- mirrors the vendored module's own console-based debug channel
      (...args: unknown[]) => console.warn('sqlite3.debugModule:', ...args)
    : () => {};
  (globalThis as { sqlite3InitModuleState?: object }).sqlite3InitModuleState = Object.assign(Object.create(null), {
    debugModule,
    wasmFilename: 'sqlite3.wasm',
    emscriptenLocateFile: options.locateFile ?? defaultLocateFile,
    emscriptenInstantiateWasm: options.instantiateWasm,
  });
}

/** Resolves the wasm to {@link SQLITE3_WASM_URL} so bundled consumers load the bundler-emitted asset by default. */
function defaultLocateFile(path: string, prefix: string): string {
  return path === 'sqlite3.wasm' ? SQLITE3_WASM_URL.href : new URL(path, prefix || import.meta.url).href;
}
