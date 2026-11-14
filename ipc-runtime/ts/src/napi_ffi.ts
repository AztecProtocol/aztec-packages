import * as path from "node:path";
import { loadIpcRuntimeNapi } from "./native_loader.js";
import type { IpcClientAsync, IpcClientSync } from "./types.js";

/**
 * A service's shared library loaded in-process: bytes in, bytes out through its FFI entry
 * (`<ffiName>_ipc_ffi_entry`), on the calling thread or on the libuv pool. Calls into one library
 * are serialized, as the FFI entry requires.
 */
export interface NapiFfiLibrary {
  /** The name the library's FFI symbols carry. */
  ffiName: string;
  call(input: Uint8Array): Uint8Array;
  callAsync(input: Uint8Array): Promise<Uint8Array>;
}

/**
 * Load the shared library at `libraryPath` and bind its `<ffiName>_ipc_ffi_entry`, through this
 * package's Node-API addon. The library is loaded once per process however often it is loaded
 * here, so every backend over one file shares the service's state: the FFI entry has one context
 * per loaded library, not one per backend. `addonPath` overrides where the addon is found.
 */
export function loadNapiFfiLibrary(
  libraryPath: string,
  ffiName: string,
  addonPath?: string,
): NapiFfiLibrary {
  const { FfiLibrary } = loadIpcRuntimeNapi(addonPath);
  const library = new FfiLibrary(path.resolve(libraryPath), ffiName);
  return {
    ffiName,
    call: (input) => library.call(input),
    callAsync: (input) => library.callAsync(input),
  };
}

function asUint8Array(buffer: Uint8Array): Uint8Array {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

/** Asynchronous backend over a service's shared library: each call runs on the libuv thread pool. */
export class NapiFfiBackend implements IpcClientAsync {
  private destroyed = false;

  constructor(private readonly library: NapiFfiLibrary) {}

  async call(input: Uint8Array): Promise<Uint8Array> {
    if (this.destroyed) {
      throw new Error(
        `${this.library.ffiName}: napi backend used after destroy()`,
      );
    }
    return asUint8Array(await this.library.callAsync(input));
  }

  /** The library stays loaded; this only stops further calls. */
  destroy(): Promise<void> {
    this.destroyed = true;
    return Promise.resolve();
  }
}

/** Synchronous backend over a service's shared library: each call runs on, and blocks, the calling thread. */
export class NapiFfiBackendSync implements IpcClientSync {
  private destroyed = false;

  constructor(private readonly library: NapiFfiLibrary) {}

  call(input: Uint8Array): Uint8Array {
    if (this.destroyed) {
      throw new Error(
        `${this.library.ffiName}: napi backend used after destroy()`,
      );
    }
    return asUint8Array(this.library.call(input));
  }

  destroy(): void {
    this.destroyed = true;
  }
}
