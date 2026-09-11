/**
 * Compile a wasm module from wherever a consumer keeps it: an already compiled `Module`, raw or
 * gzipped bytes, a fetch `Response`, or a URL (`http(s):`, `data:`, `blob:`, `file:`).
 *
 * URLs and responses go through `WebAssembly.compileStreaming`, so compilation overlaps the
 * download and, in browsers that cache compiled wasm (Chrome, Firefox), a repeat visit starts
 * from the optimized code of the previous one. Gzip is recognised from the response headers, the
 * URL, or the magic bytes and inflated with the platform's `DecompressionStream`, so a `.wasm.gz`
 * asset or a `data:application/gzip;base64,…` URL needs no JavaScript inflater.
 */
export type WasmModuleSource =
  | WebAssembly.Module
  | Uint8Array
  | ArrayBuffer
  | Response
  | URL
  | string;

export interface ModuleLoadPlatform {
  /** Read a `file:` URL (node). Browsers fetch everything. */
  readFile?(url: URL): Promise<Uint8Array>;
  /** Turn a plain filesystem path into a URL (node). */
  resolvePath?(path: string): URL;
}

const GZIP_MAGIC = [0x1f, 0x8b, 0x08];
const WASM_MAGIC = [0x00, 0x61, 0x73, 0x6d];

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  return magic.every((b, i) => bytes[i] === b);
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function compileBytes(bytes: Uint8Array): Promise<WebAssembly.Module> {
  if (startsWith(bytes, GZIP_MAGIC)) {
    bytes = await gunzip(bytes);
  }
  if (!startsWith(bytes, WASM_MAGIC)) {
    throw new Error("not a wasm module: bad magic bytes");
  }
  // Our bytes never live on a SharedArrayBuffer; the cast only satisfies BufferSource's typing.
  return WebAssembly.compile(bytes as unknown as BufferSource);
}

async function compileStreamingOrBuffer(
  response: Response,
): Promise<WebAssembly.Module> {
  if (typeof WebAssembly.compileStreaming === "function") {
    try {
      return await WebAssembly.compileStreaming(response.clone());
    } catch {
      // Some hosts reject streaming compilation of synthetic responses; buffer instead.
    }
  }
  return compileBytes(new Uint8Array(await response.arrayBuffer()));
}

async function compileResponse(
  response: Response,
  label: string,
): Promise<WebAssembly.Module> {
  if (!response.ok) {
    throw new Error(`fetching wasm module ${label}: HTTP ${response.status}`);
  }
  const type = (response.headers.get("content-type") ?? "").toLowerCase();
  const gzipped = type.includes("gzip") || /\.gz(\?|#|$)/.test(label);
  if (gzipped && response.body) {
    const inflated = new Response(
      response.body.pipeThrough(new DecompressionStream("gzip")),
      { headers: { "content-type": "application/wasm" } },
    );
    return compileStreamingOrBuffer(inflated);
  }
  if (type.includes("application/wasm")) {
    return compileStreamingOrBuffer(response);
  }
  // Unknown or missing type (octet-stream, data: URLs): sniff the bytes.
  return compileBytes(new Uint8Array(await response.arrayBuffer()));
}

export async function compileWasmModule(
  source: WasmModuleSource,
  platform: ModuleLoadPlatform = {},
): Promise<WebAssembly.Module> {
  if (source instanceof WebAssembly.Module) {
    return source;
  }
  if (source instanceof Uint8Array) {
    return compileBytes(source);
  }
  if (source instanceof ArrayBuffer) {
    return compileBytes(new Uint8Array(source));
  }
  if (source instanceof Response) {
    return compileResponse(source, source.url);
  }
  let url: URL;
  if (source instanceof URL) {
    url = source;
  } else {
    try {
      url = new URL(source);
    } catch {
      if (!platform.resolvePath) {
        throw new Error(`wasm module source is not a URL: ${source}`);
      }
      url = platform.resolvePath(source);
    }
  }
  if (url.protocol === "file:") {
    if (!platform.readFile) {
      throw new Error(
        `file: wasm module sources need a platform with readFile: ${url.href}`,
      );
    }
    return compileBytes(await platform.readFile(url));
  }
  return compileResponse(await fetch(url), url.href);
}
