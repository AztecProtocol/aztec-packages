import { TxScopedL2Log } from '@aztec/circuits.js/logs';
import { jsonStringify } from '@aztec/foundation/json-rpc';

describe('TxScopedL2Log', () => {
  it('serializes to JSON', () => {
    const log = TxScopedL2Log.random();
    expect(TxScopedL2Log.schema.parse(JSON.parse(jsonStringify(log)))).toEqual(log);
  });
});
