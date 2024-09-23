import { Buffer32 } from '@aztec/foundation/buffer';

import { SimpleProofQuoteGovernor } from './simple-proof-quote-governor.js';

describe('SimpleProofQuoteGovernor', () => {
  it('should be able to produce a quote', async () => {
    const privateKey = Buffer32.random();
    const gov = await SimpleProofQuoteGovernor.new({
      publisherPrivateKey: privateKey.to0xString(),
    });
    const quote = await gov.produceEpochProofQuote(42n);
    expect(quote).toMatchObject({
      payload: {
        epochToProve: 42n,
      },
    });

    expect(quote?.senderAddress).toEqual(gov.signerAddress);
  });
});
