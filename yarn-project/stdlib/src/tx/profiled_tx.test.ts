import { jsonStringify } from '@aztec/foundation/json-rpc';

import { TxProfileResult } from './profiled_tx.js';

describe('profiled_tx', () => {
  it('convert to and from json', () => {
    const profile = TxProfileResult.random();
    const parsed = TxProfileResult.schema.parse(JSON.parse(jsonStringify(profile)));
    expect(parsed).toEqual(profile);
  });
});
