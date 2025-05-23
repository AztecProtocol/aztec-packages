import { jsonStringify } from '@aztec/foundation/json-rpc';

import { TxScopedL2Log } from '../logs/tx_scoped_l2_log.js';

describe('TxScopedL2Log', () => {
  it('serializes to JSON', async () => {
    const log = await TxScopedL2Log.random();
    expect(TxScopedL2Log.schema.parse(JSON.parse(jsonStringify(log)))).toEqual(log);
  });
});
