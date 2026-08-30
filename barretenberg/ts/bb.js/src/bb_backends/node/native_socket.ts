import { SpawnedProcessBackend } from '@aztec-foundation/ipc-runtime';
import * as os from 'os';

import { IMsgpackBackendAsync } from '../interface.js';

/**
 * Asynchronous native backend that communicates with the bb binary over a Unix
 * Domain Socket, via @aztec-foundation/ipc-runtime's SpawnedProcessBackend: bb is spawned
 * as the server (`bb msgpack run --input <path>.sock`) and the runtime owns
 * spawn, connect (raced against child death), envelope framing / request-id
 * correlation, and teardown.
 *
 * The child and the idle socket are always unref'd: bb monitors parent death
 * (prctl/kqueue) and exits on its own, so it must not hold the Node event loop
 * open. `unref` additionally unrefs the log pipes, which would otherwise keep
 * the loop alive while a logger is attached.
 */
export class BarretenbergNativeSocketAsyncBackend implements IMsgpackBackendAsync {
  private constructor(private backend: SpawnedProcessBackend) {}

  static async new(
    bbBinaryPath: string,
    threads?: number,
    logger?: (msg: string) => void,
    unref?: boolean,
  ): Promise<BarretenbergNativeSocketAsyncBackend> {
    // If threads not set use num cpu cores, max 16.
    const hwc = threads ? threads.toString() : Math.min(16, os.cpus().length).toString();
    const backend = await SpawnedProcessBackend.spawn({
      binaryPath: bbBinaryPath,
      binaryName: 'bb',
      instancePrefix: 'bb',
      ipcPathArgs: ['msgpack', 'run', '--input', '{path}'],
      transport: 'uds',
      logger,
      env: { HARDWARE_CONCURRENCY: hwc },
      unref: true,
      unrefStdio: unref,
    });
    return new BarretenbergNativeSocketAsyncBackend(backend);
  }

  call(inputBuffer: Uint8Array): Promise<Uint8Array> {
    return this.backend.call(inputBuffer);
  }

  destroy(): Promise<void> {
    return this.backend.destroy();
  }
}
