import { createLogger } from '@aztec/foundation/log';
import { SerialQueue } from '@aztec/foundation/queue';
import type { ClientProtocolCircuitVerifier } from '@aztec/stdlib/interfaces/server';
import type { Tx } from '@aztec/stdlib/tx';

import type { BBConfig } from '../config.js';

export class QueuedIVCVerifier implements ClientProtocolCircuitVerifier {
  private queue: SerialQueue;

  public constructor(
    config: BBConfig,
    private verifier: ClientProtocolCircuitVerifier,
    private logger = createLogger('bb-prover:queued_ivc_verifier'),
  ) {
    this.queue = new SerialQueue();
    this.logger.warn(`Starting QueuedIVCVerifier with ${config.numConcurrentIVCVerifiers} concurrent verifiers`);
    this.queue.start(config.numConcurrentIVCVerifiers);
  }

  public verifyProof(tx: Tx): Promise<{ valid: boolean; duration: number; totalDuration: number }> {
    return this.queue.put(() => this.verifier.verifyProof(tx));
  }

  stop(): Promise<void> {
    return this.queue.end();
  }
}
