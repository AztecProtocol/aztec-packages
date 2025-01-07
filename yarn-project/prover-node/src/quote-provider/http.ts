import { type L2Block } from '@aztec/circuit-types';
import { jsonStringify } from '@aztec/foundation/json-rpc';

import { type QuoteProvider, type QuoteProviderResult } from './index.js';
import { getTotalFees, getTxCount } from './utils.js';

export class HttpQuoteProvider implements QuoteProvider {
  constructor(private readonly url: string) {}

  public async getQuote(epochNumber: number, epoch: L2Block[]): Promise<QuoteProviderResult | undefined> {
    const payload: HttpQuoteRequestPayload = {
      epochNumber,
      fromBlock: epoch[0].number,
      toBlock: epoch.at(-1)!.number,
      totalFees: getTotalFees(epoch).toString(),
      txCount: getTxCount(epoch),
    };

    const response = await fetch(this.url, {
      method: 'POST',
      body: jsonStringify(payload),
      headers: { 'content-type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch quote: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.basisPointFee || !data.bondAmount) {
      throw new Error(`Missing required fields (basisPointFee | bondAmount) in response: ${jsonStringify(data)}`);
    }

    const basisPointFee = Number(data.basisPointFee);
    const bondAmount = BigInt(data.bondAmount);
    const validUntilSlot = data.validUntilSlot ? BigInt(data.validUntilSlot) : undefined;

    return { basisPointFee, bondAmount, validUntilSlot };
  }
}

export type HttpQuoteRequestPayload = {
  epochNumber: number;
  fromBlock: number;
  toBlock: number;
  totalFees: string;
  txCount: number;
};
