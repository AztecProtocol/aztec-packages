import { type EpochProofQuote } from '@aztec/circuit-types';

export interface EpochProofQuotePool {
  addQuote(quote: EpochProofQuote): void;
  getQuotes(epoch: bigint): EpochProofQuote[];
  deleteQuotesToEpoch(epoch: bigint): void;
}
