import type {
  WorldStateMessageType,
  WorldStateRequest,
  WorldStateRequestCategories,
  WorldStateResponse,
} from './message.js';

/**
 * Backend-agnostic handle to a running aztec-wsdb world state, accessed by the TS layer.
 *
 * Two implementations exist:
 *   - {@link IpcWorldState} — talks to a standalone aztec-wsdb process over UDS or shared memory.
 *
 * The legacy in-process NAPI implementation has been removed; the C++ AVM (NAPI) now connects to
 * the same aztec-wsdb process via UDS using the socket path returned by {@link getSocketPath}.
 */
export interface NativeWorldStateInstance {
  /**
   * Send a typed msgpack message to the backing world state and await its response.
   *
   * @param responseHandler — optional pre-resolution hook executed on the per-fork queue, useful
   *   for caching responses while the queue still holds the fork lock.
   * @param errorHandler — optional pre-rejection hook executed on the per-fork queue.
   */
  call<T extends WorldStateMessageType>(
    messageType: T,
    body: WorldStateRequest[T] & WorldStateRequestCategories,
    responseHandler?: (response: WorldStateResponse[T]) => WorldStateResponse[T],
    errorHandler?: (error: string) => void,
  ): Promise<WorldStateResponse[T]>;

  /**
   * UDS path the underlying aztec-wsdb process listens on. The C++ AVM uses this to attach to the
   * same world state instance the TS layer is using.
   */
  getSocketPath(): string;

  /**
   * Shut down the world state instance. Cancels any in-flight queues, closes the IPC channel, and
   * terminates the underlying aztec-wsdb process. Idempotent.
   */
  close(): Promise<void>;
}
