import { jsonStringify } from '@aztec/foundation/json-rpc';

import { mockTx } from '../mocks.js';
import { Tx } from './tx.js';

describe('Tx', () => {
  it('convert to and from buffer', async () => {
    const tx = await mockTx();
    const buf = tx.toBuffer();
    expect(Tx.fromBuffer(buf)).toEqual(tx);
  });

  it('convert to and from json', () => {
    const tx = mockTx();
    const json = jsonStringify(tx);
    expect(Tx.schema.parse(JSON.parse(json))).toEqual(tx);
  });
});
