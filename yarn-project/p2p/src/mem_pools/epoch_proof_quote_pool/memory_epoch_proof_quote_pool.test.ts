import { type EpochProofQuote, mockEpochProofQuote } from '@aztec/circuit-types';

import { type MockProxy, mock } from 'jest-mock-extended';

import { type PoolInstrumentation } from '../instrumentation.js';
import { MemoryEpochProofQuotePool } from './memory_epoch_proof_quote_pool.js';

describe('MemoryEpochProofQuotePool', () => {
  let pool: MemoryEpochProofQuotePool;

  let metricsMock: MockProxy<PoolInstrumentation<EpochProofQuote>>;

  beforeEach(() => {
    pool = new MemoryEpochProofQuotePool();

    metricsMock = mock<PoolInstrumentation<EpochProofQuote>>();
    (pool as any).metrics = metricsMock;
  });

  it('should add/get quotes to/from pool', () => {
    const quote = mockEpochProofQuote(5n);

    pool.addQuote(quote);

    expect(metricsMock.recordAddedObjects).toHaveBeenCalledWith(1);

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
    const quotesForEpoch2 = proofQuotes.filter(x => x.payload.epochToProve === 2n);

    expect(quotes3).toHaveLength(quotesForEpoch3.length);
    expect(quotes3).toEqual(quotesForEpoch3);

    // should delete all quotes for epochs 2 and 3
    pool.deleteQuotesToEpoch(3n);

    expect(metricsMock.recordRemovedObjects).toHaveBeenCalledWith(quotesForEpoch2.length + quotesForEpoch3.length);

    expect(pool.getQuotes(2n)).toHaveLength(0);
    expect(pool.getQuotes(3n)).toHaveLength(0);

    const quotes4 = pool.getQuotes(4n);
    const quotesForEpoch4 = proofQuotes.filter(x => x.payload.epochToProve === 4n);

    expect(quotes4).toHaveLength(quotesForEpoch4.length);
    expect(quotes4).toEqual(quotesForEpoch4);
  });
});
