import { jsonStringify } from '@aztec/foundation/json-rpc';

import { TxProvingResult } from './proven_tx.js';

describe('proven_tx', () => {
  it('convert to and from json', async () => {
    const tx = await TxProvingResult.random();
    const parsed = TxProvingResult.schema.parse(JSON.parse(jsonStringify(tx)));
    expect(parsed).toEqual(tx);
  });
});
