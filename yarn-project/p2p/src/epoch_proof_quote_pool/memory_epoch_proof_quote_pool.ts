import { type EpochProofQuote } from '@aztec/circuit-types';

export class MemoryEpochProofQuotePool {
  private quotes: Map<bigint, EpochProofQuote[]>;
  constructor() {
    this.quotes = new Map();
  }
  addQuote(quote: EpochProofQuote) {
    const epoch = quote.payload.epochToProve;
    if (!this.quotes.has(epoch)) {
      this.quotes.set(epoch, []);
    }
    this.quotes.get(epoch)!.push(quote);
  }
  getQuotes(epoch: bigint): EpochProofQuote[] {
    return this.quotes.get(epoch) || [];
  }
}
