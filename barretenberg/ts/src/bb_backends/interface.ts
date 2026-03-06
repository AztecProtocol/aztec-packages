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

  /**
   * Send an async request with a request_id. Response may arrive out of order.
   * The request is wrapped as [request_id, Command] in the new protocol.
   * Returns the request_id and a promise for the response.
   *
   * Not all backends support this — callers should check before using.
   */
  callAsync?(inputBuffer: Uint8Array): Promise<{ requestId: number; response: Promise<Uint8Array> }>;
}
