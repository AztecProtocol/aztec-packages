import type { EpochProofQuote } from '@aztec/circuit-types';

export interface ProofQuoteGovernor {
  ensureBond(amount: bigint): Promise<void>;
  produceEpochProofQuote(epoch: bigint): Promise<EpochProofQuote | undefined>;
}
