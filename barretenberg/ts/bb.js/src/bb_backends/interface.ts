/**
 * Generic interface for msgpack backend implementations.
 * Both WASM and native binary backends implement this interface.
 */
export interface IMsgpackBackend {
  /**
   * Execute a msgpack command and return the msgpack response.
   * @param inputBuffer The msgpack-encoded input buffer
   * @returns The msgpack-encoded response buffer (sync or async)
   */
  call(inputBuffer: Uint8Array): Uint8Array | Promise<Uint8Array>;

  /**
   * Whether the backend is usable: not destroyed and, for a backend driving a bb child process, that
   * process is running and, for the socket backend, connected. WASM backends are alive until destroy().
   * A backend that is not alive never becomes alive again.
   *
   * Process exit and disconnect are observed on the event loop, so a call can fail even though this
   * returned true. On the shared-memory backends a call to a bb process that has died does not settle.
   */
  isAlive(): boolean;

  /**
   * Clean up resources.
   */
  destroy(): void | Promise<void>;
}

/**
 * Synchronous variant of IMsgpackBackend.
 * Used by BarretenbergSync and SyncApi.
 */
export interface IMsgpackBackendSync extends IMsgpackBackend {
  call(inputBuffer: Uint8Array): Uint8Array;
  destroy(): void;
}

/**
 * Asynchronous variant of IMsgpackBackend.
 * Used by Barretenberg and AsyncApi.
 */
export interface IMsgpackBackendAsync extends IMsgpackBackend {
  call(inputBuffer: Uint8Array): Promise<Uint8Array>;
  destroy(): Promise<void>;
}
