import { mockEpochProofQuote } from '@aztec/circuit-types';

import { MemoryEpochProofQuotePool } from './memory_epoch_proof_quote_pool.js';

describe('MemoryEpochProofQuotePool', () => {
  let pool: MemoryEpochProofQuotePool;

  beforeEach(() => {
    pool = new MemoryEpochProofQuotePool();
  });

  it('should add/get quotes to/from pool', () => {
    const quote = mockEpochProofQuote(5n);

    pool.addQuote(quote);

    const quotes = pool.getQuotes(quote.payload.epochToProve);

    expect(quotes).toHaveLength(1);
    expect(quotes[0]).toEqual(quote);
  });

  it('should delete quotes for expired epochs', () => {
    const proofQuotes = [
      mockEpochProofQuote(3n),
      mockEpochProofQuote(2n),
      mockEpochProofQuote(3n),
      mockEpochProofQuote(4n),
      mockEpochProofQuote(2n),
      mockEpochProofQuote(3n),
    ];

    for (const quote of proofQuotes) {
      pool.addQuote(quote);
    }

    const quotes3 = pool.getQuotes(3n);
    const quotesForEpoch3 = proofQuotes.filter(x => x.payload.epochToProve === 3n);

    expect(quotes3).toHaveLength(quotesForEpoch3.length);
    expect(quotes3).toEqual(quotesForEpoch3);

    // should delete all quotes for epochs 2 and 3
    pool.deleteQuotesToEpoch(3n);

    expect(pool.getQuotes(2n)).toHaveLength(0);
    expect(pool.getQuotes(3n)).toHaveLength(0);

    const quotes4 = pool.getQuotes(4n);
    const quotesForEpoch4 = proofQuotes.filter(x => x.payload.epochToProve === 4n);

    expect(quotes4).toHaveLength(quotesForEpoch4.length);
    expect(quotes4).toEqual(quotesForEpoch4);
  });
});
