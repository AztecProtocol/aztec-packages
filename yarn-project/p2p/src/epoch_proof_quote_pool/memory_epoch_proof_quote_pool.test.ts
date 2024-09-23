import { MemoryEpochProofQuotePool } from './memory_epoch_proof_quote_pool.js';
import { makeRandomEpochProofQuote } from './test_utils.js';

describe('MemoryEpochProofQuotePool', () => {
  let pool: MemoryEpochProofQuotePool;

  beforeEach(() => {
    pool = new MemoryEpochProofQuotePool();
  });

  it('should add/get quotes to/from pool', () => {
    const { quote } = makeRandomEpochProofQuote();

    pool.addQuote(quote);

    const quotes = pool.getQuotes(quote.payload.epochToProve);

    expect(quotes).toHaveLength(1);
    expect(quotes[0]).toEqual(quote);
  });
});
