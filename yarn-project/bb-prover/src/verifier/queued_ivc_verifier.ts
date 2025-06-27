import { createLogger } from '@aztec/foundation/log';
import { SerialQueue } from '@aztec/foundation/queue';
import type { ClientProtocolCircuitVerifier, IVCProofVerificationResult } from '@aztec/stdlib/interfaces/server';
import type { Tx } from '@aztec/stdlib/tx';
import {
  type Histogram,
  Metrics,
  type TelemetryClient,
  type UpDownCounter,
  ValueType,
  getTelemetryClient,
} from '@aztec/telemetry-client';

import type { BBConfig } from '../config.js';

class IVCVerifierMetrics {
  private ivcVerificationHistogram: Histogram;
  private ivcTotalVerificationHistogram: Histogram;
  private ivcFailureCount: UpDownCounter;

  constructor(client: TelemetryClient, name = 'QueuedIVCVerifier') {
    const meter = client.getMeter(name);

    this.ivcVerificationHistogram = meter.createHistogram(Metrics.IVC_VERIFIER_TIME, {
      unit: 'ms',
      description: 'Duration to verify client IVC proofs',
      valueType: ValueType.INT,
    });

    this.ivcTotalVerificationHistogram = meter.createHistogram(Metrics.IVC_VERIFIER_TOTAL_TIME, {
      unit: 'ms',
      description: 'Total duration to verify client IVC proofs, including serde',
      valueType: ValueType.INT,
    });

    this.ivcFailureCount = meter.createUpDownCounter(Metrics.IVC_VERIFIER_FAILURE_COUNT, {
      description: 'Count of failed IVC proof verifications',
      valueType: ValueType.INT,
    });
  }

  recordIVCVerification(result: IVCProofVerificationResult) {
    this.ivcVerificationHistogram.record(Math.ceil(result.durationMs));
    this.ivcTotalVerificationHistogram.record(Math.ceil(result.totalDurationMs));
    if (!result.valid) {
      this.ivcFailureCount.add(1);
    }
  }
}

export class QueuedIVCVerifier implements ClientProtocolCircuitVerifier {
  private queue: SerialQueue;
  private metrics: IVCVerifierMetrics;

  public constructor(
    config: BBConfig,
    private verifier: ClientProtocolCircuitVerifier,
    private telemetry: TelemetryClient = getTelemetryClient(),
    private logger = createLogger('bb-prover:queued_ivc_verifier'),
  ) {
    this.metrics = new IVCVerifierMetrics(this.telemetry, 'QueuedIVCVerifier');
    this.queue = new SerialQueue();
    this.logger.info(`Starting QueuedIVCVerifier with ${config.numConcurrentIVCVerifiers} concurrent verifiers`);
    this.queue.start(config.numConcurrentIVCVerifiers);
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
