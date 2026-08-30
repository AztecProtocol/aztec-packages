import { SpawnedProcessBackend } from '@aztec/ipc-runtime';

import { IMsgpackBackendAsync } from '../interface.js';

// Larger rings than the sync backend: this one pipelines, so several requests
// and responses can be in the rings at once.
const RING_SIZE = 1024 * 1024 * 4;

/**
 * Asynchronous native backend: bb serves over shared memory and
 * @aztec/ipc-runtime's SpawnedProcessBackend owns the process lifecycle.
 * Supports pipelining — responses are paired to callers by request id, so bb
 * may complete them in any order.
 */
export class BarretenbergNativeShmAsyncBackend implements IMsgpackBackendAsync {
  private constructor(private backend: SpawnedProcessBackend) {}

  /**
   * Create and initialize an async shared memory backend.
   * @param bbBinaryPath Path to bb binary
   * @param napiPath Optional override for the ipc-runtime NAPI addon
   * @param threads Optional number of threads (defaults to 16)
   * @param logger Optional receiver for bb's output
   */
  static async new(
    bbBinaryPath: string,
    napiPath?: string,
    threads?: number,
    logger?: (msg: string) => void,
  ): Promise<BarretenbergNativeShmAsyncBackend> {
    const backend = await SpawnedProcessBackend.spawn({
      binaryPath: bbBinaryPath,
      binaryName: 'bb',
      instancePrefix: 'bb-async',
      ipcPathArgs: ['msgpack', 'run', '--input', '{path}'],
      extraArgs: ['--request-ring-size', `${RING_SIZE}`, '--response-ring-size', `${RING_SIZE}`],
      transport: 'shm',
      clientId: 0,
      napiPath,
      logger,
      // bb monitors parent death (prctl/kqueue) and exits on its own, so it
      // must not hold the Node event loop open; calls in flight still keep it
      // alive. Without this a caller that never destroy()s the backend hangs
      // at exit.
      unref: true,
      env: { HARDWARE_CONCURRENCY: threads ? threads.toString() : '16' },
    });
    return new BarretenbergNativeShmAsyncBackend(backend);
  }

  call(inputBuffer: Uint8Array): Promise<Uint8Array> {
    return this.backend.call(inputBuffer);
  }

  destroy(): Promise<void> {
    return this.backend.destroy();
  }
}
