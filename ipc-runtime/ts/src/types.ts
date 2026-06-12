/**
 * Minimal byte-in / byte-out interface that the ipc-codegen-emitted
 * <Service>Api types consume. Both UDS and SHM transports satisfy this.
 */
export interface IpcClientAsync {
  call(input: Uint8Array): Promise<Uint8Array>;
  destroy(): Promise<void>;
}

export interface IpcClientSync {
  call(input: Uint8Array): Uint8Array;
  destroy(): void;
}

// Shared transport constants, mirroring cpp/ipc_runtime/constants.hpp —
// keep the two in sync.

/**
 * Maximum length-prefix value accepted on receive. A frame claiming more
 * than this is treated as corruption and the connection is closed instead
 * of buffering the claimed size.
 */
export const MAX_FRAME_SIZE = 256 * 1024 * 1024; // 256 MiB

/**
 * Total budget (ms) for connect() retry loops, covering the window where
 * the server process is still starting up.
 */
export const CONNECT_RETRY_BUDGET_MS = 5000;

/** Default ring size for SHM transports (per direction, per client). */
export const DEFAULT_RING_SIZE = 4 * 1024 * 1024; // 4 MiB

/** Default listen backlog for UDS servers. */
export const SOCKET_BACKLOG = 10;

/** Default per-call timeout: 0 = infinite (matches the C++ client APIs). */
export const DEFAULT_CALL_TIMEOUT_NS = 0;
