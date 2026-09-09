/**
 * The slice of WASI preview1 an in-process service needs: clocks, randomness, environ/args,
 * stdout/stderr, exit. Every other WASI function the module imports is answered with `ENOSYS`,
 * so linking never fails on a syscall the module carries but never calls (file I/O in a module
 * that gets its inputs over the FFI entry, for instance).
 */
export const WASI_NAMESPACE = "wasi_snapshot_preview1";

const ERRNO_SUCCESS = 0;
const ERRNO_BADF = 8;
const ERRNO_NOSYS = 52;

/** Raised when the module calls `proc_exit`; the process must not actually exit. */
export class WasmExitError extends Error {
  constructor(public readonly code: number) {
    super(`wasm module called proc_exit(${code})`);
    this.name = "WasmExitError";
  }
}

export interface WasiShimOptions {
  /** Environment visible to the module through `environ_get` (e.g. `HARDWARE_CONCURRENCY`). */
  env?: Record<string, string>;
  /** Program arguments visible through `args_get`. */
  args?: string[];
  /** Receives complete lines written to fd 1 / fd 2. */
  onStdout?: (line: string) => void;
  onStderr?: (line: string) => void;
}

function encodeNulTerminated(values: string[]): Uint8Array[] {
  const encoder = new TextEncoder();
  return values.map((v) => encoder.encode(`${v}\0`));
}

/**
 * Build the WASI import object for `module`. `memory` is read lazily on every call because the
 * module's memory may grow (and its `buffer` be detached) between calls.
 */
export function createWasiImports(
  module: WebAssembly.Module,
  memory: () => WebAssembly.Memory,
  opts: WasiShimOptions = {},
): Record<string, (...args: number[]) => number> {
  const view = () => new DataView(memory().buffer);
  const bytes = () => new Uint8Array(memory().buffer);
  const decoder = new TextDecoder();
  const envEntries = encodeNulTerminated(
    Object.entries(opts.env ?? {}).map(([k, v]) => `${k}=${v}`),
  );
  const argEntries = encodeNulTerminated(opts.args ?? []);
  const pending: Record<number, string> = {};

  const sizesGet = (
    entries: Uint8Array[],
    countOut: number,
    sizeOut: number,
  ) => {
    view().setUint32(countOut, entries.length, true);
    view().setUint32(
      sizeOut,
      entries.reduce((n, e) => n + e.length, 0),
      true,
    );
    return ERRNO_SUCCESS;
  };
  const stringsGet = (
    entries: Uint8Array[],
    ptrsOut: number,
    bufOut: number,
  ) => {
    let p = bufOut;
    entries.forEach((e, i) => {
      view().setUint32(ptrsOut + 4 * i, p, true);
      bytes().set(e, p);
      p += e.length;
    });
    return ERRNO_SUCCESS;
  };

  const implemented: Record<string, (...args: number[]) => number> = {
    args_sizes_get: (countOut, sizeOut) =>
      sizesGet(argEntries, countOut, sizeOut),
    args_get: (ptrsOut, bufOut) => stringsGet(argEntries, ptrsOut, bufOut),
    environ_sizes_get: (countOut, sizeOut) =>
      sizesGet(envEntries, countOut, sizeOut),
    environ_get: (ptrsOut, bufOut) => stringsGet(envEntries, ptrsOut, bufOut),
    clock_res_get: (_id, out) => {
      view().setBigUint64(out, 1000n, true);
      return ERRNO_SUCCESS;
    },
    clock_time_get: (_id, _precision, out) => {
      const ns = BigInt(
        Math.round((performance.timeOrigin + performance.now()) * 1e6),
      );
      view().setBigUint64(out, ns, true);
      return ERRNO_SUCCESS;
    },
    random_get: (ptr, len) => {
      // getRandomValues refuses views over shared memory and caps a call at 64 KiB: fill a
      // private buffer in chunks and copy it in.
      const dst = bytes();
      for (let off = 0; off < len; off += 65536) {
        const chunk = new Uint8Array(Math.min(65536, len - off));
        crypto.getRandomValues(chunk);
        dst.set(chunk, ptr + off);
      }
      return ERRNO_SUCCESS;
    },
    fd_write: (fd, iovs, iovsLen, nwrittenOut) => {
      let total = 0;
      let text = "";
      for (let i = 0; i < iovsLen; i++) {
        const ptr = view().getUint32(iovs + i * 8, true);
        const len = view().getUint32(iovs + i * 8 + 4, true);
        text += decoder.decode(bytes().subarray(ptr, ptr + len));
        total += len;
      }
      const sink =
        fd === 1 ? opts.onStdout : fd === 2 ? opts.onStderr : undefined;
      if (sink) {
        const lines = ((pending[fd] ?? "") + text).split("\n");
        pending[fd] = lines.pop() ?? "";
        for (const line of lines) {
          sink(line);
        }
      }
      view().setUint32(nwrittenOut, total, true);
      return ERRNO_SUCCESS;
    },
    fd_fdstat_get: (fd, out) => {
      if (fd > 2) {
        return ERRNO_BADF;
      }
      bytes().fill(0, out, out + 24);
      view().setUint8(out, 2); // filetype: character device
      return ERRNO_SUCCESS;
    },
    fd_close: () => ERRNO_BADF,
    sched_yield: () => ERRNO_SUCCESS,
    proc_exit: (code) => {
      throw new WasmExitError(code);
    },
  };

  const imports: Record<string, (...args: number[]) => number> = {};
  for (const imp of WebAssembly.Module.imports(module)) {
    if (imp.module !== WASI_NAMESPACE || imp.kind !== "function") {
      continue;
    }
    imports[imp.name] = implemented[imp.name] ?? (() => ERRNO_NOSYS);
  }
  return imports;
}
