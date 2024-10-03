import { type EpochProofQuotePayload, type L2Block } from '@aztec/circuit-types';

type QuoteProviderResult = Pick<EpochProofQuotePayload, 'basisPointFee' | 'bondAmount'> &
  Partial<Pick<EpochProofQuotePayload, 'validUntilSlot'>>;

export interface QuoteProvider {
  getQuote(epoch: L2Block[]): Promise<QuoteProviderResult | undefined>;
}
