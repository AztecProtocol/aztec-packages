import { createLogger } from '@aztec/foundation/log';
import { SerialQueue } from '@aztec/foundation/queue';
import type { ClientProtocolCircuitVerifier, IVCProofVerificationResult } from '@aztec/stdlib/interfaces/server';
import type { Tx } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { ChonkVerifierMetrics } from './chonk_verifier_metrics.js';

/** Concurrency-limited wrapper around a ClientProtocolCircuitVerifier. */
export class QueuedIVCVerifier implements ClientProtocolCircuitVerifier {
  private queue: SerialQueue;
  private metrics: ChonkVerifierMetrics;

  public constructor(
    private verifier: ClientProtocolCircuitVerifier,
    concurrency: number,
    private telemetry: TelemetryClient = getTelemetryClient(),
    private logger = createLogger('bb-prover:queued_chonk_verifier'),
  ) {
    this.metrics = new ChonkVerifierMetrics(this.telemetry, 'QueuedIVCVerifier');
    this.queue = new SerialQueue();
    this.logger.info(`Starting QueuedIVCVerifier with ${concurrency} concurrent verifiers`);
    this.queue.start(concurrency);
  }

  public async verifyProof(tx: Tx): Promise<IVCProofVerificationResult> {
    const result = await this.queue.put(() => this.verifier.verifyProof(tx));
    this.metrics.recordIVCVerification(result);
    return result;
  }

  stop(): Promise<void> {
    return this.queue.end();
  }
}
