import { jsonStringify } from '@aztec/foundation/json-rpc';

import { TxScopedL2Log } from './get_logs_response.js';

describe('TxScopedL2Log', () => {
  it('serializes to JSON', () => {
    const log = TxScopedL2Log.random();
    expect(TxScopedL2Log.schema.parse(JSON.parse(jsonStringify(log)))).toEqual(log);
  });
});
