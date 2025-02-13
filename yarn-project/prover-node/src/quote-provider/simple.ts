import { type EpochProofQuotePayload, type L2Block } from '@aztec/circuit-types';

import { type QuoteProvider } from './index.js';

export class SimpleQuoteProvider implements QuoteProvider {
  constructor(public readonly basisPointFee: number, public readonly bondAmount: bigint) {}

  getQuote(
    _epochNumber: number,
    _epoch: L2Block[],
  ): Promise<Pick<EpochProofQuotePayload, 'basisPointFee' | 'bondAmount'>> {
    const { basisPointFee, bondAmount } = this;
    return Promise.resolve({ basisPointFee, bondAmount });
  }
}
