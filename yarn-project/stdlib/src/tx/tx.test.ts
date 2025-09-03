import { jsonStringify } from '@aztec/foundation/json-rpc';

import { mockTx } from '../tests/mocks.js';
import { Tx } from './tx.js';

describe('Tx', () => {
  it('convert to and from buffer', async () => {
    const tx = await mockTx();
    const buf = tx.toBuffer();
    expect(Tx.fromBuffer(buf)).toEqual(tx);
  });

  it('convert to and from json', async () => {
    const tx = await mockTx();
    const json = jsonStringify(tx);
    expect(await Tx.schema.parseAsync(JSON.parse(json))).toEqual(tx);
  });
});
