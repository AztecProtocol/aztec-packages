import { IMsgpackBackendSync, IMsgpackBackendAsync } from './interface.js';

/**
 * Adapter that wraps a synchronous backend to provide an async interface.
 * The sync backend's blocking calls are simply wrapped in Promise.resolve().
 *
 * This is useful for backends like shared memory where the call is actually
 * synchronous but we want to use it with the async API.
 */
export class SyncToAsyncAdapter implements IMsgpackBackendAsync {
  constructor(private syncBackend: IMsgpackBackendSync) {}

  async call(inputBuffer: Uint8Array): Promise<Uint8Array> {
    // The sync backend blocks until complete, so just wrap in a resolved promise
    return Promise.resolve(this.syncBackend.call(inputBuffer));
  }

  async destroy(): Promise<void> {
    this.syncBackend.destroy();
  }
}
