import { jsonStringify } from '@aztec/foundation/json-rpc';

import { TxScopedL2Log } from '../logs/tx_scoped_l2_log.js';
import { randomTxScopedPrivateL2Log } from '../tests/factories.js';

describe('TxScopedL2Log', () => {
  it('serializes to JSON', () => {
    const log = randomTxScopedPrivateL2Log();
    expect(TxScopedL2Log.schema.parse(JSON.parse(jsonStringify(log)))).toEqual(log);
  });
});
