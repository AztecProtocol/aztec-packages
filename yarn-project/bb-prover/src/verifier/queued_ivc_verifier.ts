import { SerialQueue } from '@aztec/foundation/queue';
import type { ClientProtocolCircuitVerifier } from '@aztec/stdlib/interfaces/server';
import type { Tx } from '@aztec/stdlib/tx';

import type { BBConfig } from '../config.js';

export class QueuedIVCVerifier implements ClientProtocolCircuitVerifier {
  private queue: SerialQueue;

  public constructor(
    config: BBConfig,
    private verifier: ClientProtocolCircuitVerifier,
  ) {
    this.queue = new SerialQueue();
    this.queue.start(config.numConcurrentIVCVerifiers);
  }

  public verifyProof(tx: Tx): Promise<boolean> {
    return this.queue.put(() => this.verifier.verifyProof(tx));
  }

  stop(): Promise<void> {
    return this.queue.end();
  }
}
