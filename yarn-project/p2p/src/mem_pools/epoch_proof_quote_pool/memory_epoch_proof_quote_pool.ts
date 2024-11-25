import { type EpochProofQuote } from '@aztec/circuit-types';
import { type TelemetryClient } from '@aztec/telemetry-client';

import { PoolInstrumentation, PoolName } from '../instrumentation.js';
import { type EpochProofQuotePool } from './epoch_proof_quote_pool.js';

export class MemoryEpochProofQuotePool implements EpochProofQuotePool {
  private quotes: Map<bigint, EpochProofQuote[]>;
  private metrics: PoolInstrumentation<EpochProofQuote>;

  constructor(telemetry: TelemetryClient) {
    this.quotes = new Map();
    this.metrics = new PoolInstrumentation(telemetry, PoolName.EPOCH_PROOF_QUOTE_POOL);
  }

  addQuote(quote: EpochProofQuote) {
    const epoch = quote.payload.epochToProve;
    if (!this.quotes.has(epoch)) {
      this.quotes.set(epoch, []);
    }
    this.quotes.get(epoch)!.push(quote);

    this.metrics.recordAddedObjects(1);
  }
  getQuotes(epoch: bigint): EpochProofQuote[] {
    return this.quotes.get(epoch) || [];
  }
  deleteQuotesToEpoch(epoch: bigint): void {
    const expiredEpochs = Array.from(this.quotes.keys()).filter(k => k <= epoch);

    let removedObjectsCount = 0;
    for (const expiredEpoch of expiredEpochs) {
      // For logging
      removedObjectsCount += this.quotes.get(expiredEpoch)?.length || 0;

      this.quotes.delete(expiredEpoch);
    }

    this.metrics.recordRemovedObjects(removedObjectsCount);
  }
}
