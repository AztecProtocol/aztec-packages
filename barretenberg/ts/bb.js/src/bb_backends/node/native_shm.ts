import { SpawnedProcessBackendSync } from '@aztec-foundation/ipc-runtime';

import { IMsgpackBackendSync } from '../interface.js';

// Sync callers do short, one-at-a-time requests, so a single 4MB request ring
// is ample; the response ring keeps the runtime default.
const REQUEST_RING_SIZE = 1024 * 1024 * 4;

/**
 * Synchronous native backend: bb serves over shared memory (`bb msgpack run
 * --input <name>.shm`) and @aztec-foundation/ipc-runtime's SpawnedProcessBackendSync owns
 * the process lifecycle — stale-segment removal, spawn, retrying connect,
 * death attribution and teardown.
 */
export class BarretenbergNativeShmSyncBackend implements IMsgpackBackendSync {
  private constructor(private backend: SpawnedProcessBackendSync) {}

  /**
   * Create and initialize a shared memory backend.
   * @param bbBinaryPath Path to bb binary
   * @param napiPath Optional override for the ipc-runtime NAPI addon
   * @param threads Optional number of threads
   * @param logger Optional receiver for bb's output
   */
  static async new(
    bbBinaryPath: string,
    napiPath?: string,
    threads?: number,
    logger?: (msg: string) => void,
    unref?: boolean,
  ): Promise<BarretenbergNativeShmSyncBackend> {
    // Sync backends aren't expected to do long-lived work, so default to one thread.
    const backend = await SpawnedProcessBackendSync.spawn({
      binaryPath: bbBinaryPath,
      binaryName: 'bb',
      instancePrefix: 'bb-sync',
      ipcPathArgs: ['msgpack', 'run', '--input', '{path}'],
      extraArgs: ['--request-ring-size', `${REQUEST_RING_SIZE}`],
      transport: 'shm',
      clientId: 0,
      napiPath,
      logger,
      // bb monitors parent death (prctl/kqueue) and exits on its own, so it
      // must not hold the Node event loop open; calls in flight still keep it
      // alive. Without this a caller that never destroy()s the backend hangs
      // at exit.
      unref: true,
      unrefStdio: unref,
      env: { HARDWARE_CONCURRENCY: threads ? threads.toString() : '1' },
    });
    return new BarretenbergNativeShmSyncBackend(backend);
  }

  call(inputBuffer: Uint8Array): Uint8Array {
    return this.backend.call(inputBuffer);
  }

  destroy(): void {
    this.backend.destroy();
  }
}
