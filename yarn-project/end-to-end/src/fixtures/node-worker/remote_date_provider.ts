import { DateProvider } from '@aztec/foundation/timer';

import type { MessagePort } from 'worker_threads';

/** Message shape sent from the main thread to the worker's {@link RemoteDateProvider}. */
export type DateOffsetMessage = { offset: number };

/**
 * Worker-side {@link DateProvider} whose offset is driven by the main-thread's authoritative
 * `TestDateProvider`. Offset updates arrive as `{ offset }` messages on a dedicated
 * {@link MessagePort}. `now()` stays synchronous — hot-path callers (sequencer slot timers,
 * epoch cache) read the cached offset directly.
 *
 * Updates are fire-and-forget; no ack. Drift tolerance is generous because tests warp time in
 * discrete jumps, not smooth ticks.
 */
export class RemoteDateProvider extends DateProvider {
  private offset = 0;

  constructor(private readonly port: MessagePort) {
    super();
    this.port.on('message', (msg: DateOffsetMessage | undefined) => {
      if (msg && typeof msg.offset === 'number') {
        this.offset = msg.offset;
      }
    });
  }

  public override now(): number {
    return Date.now() + this.offset;
  }
}
