import { jsonParseWithSchema, jsonStringify } from '@aztec/foundation/json-rpc';

import { TxExecutionRequest } from './tx_execution_request.js';

describe('TxExecutionRequest', () => {
  it('serializes to json and deserializes it back', async () => {
    const request = await TxExecutionRequest.random();
    const json = jsonStringify(request);
    expect(jsonParseWithSchema(json, TxExecutionRequest.schema)).toEqual(request);
  });

  it('serializes to buffer and deserializes it back', async () => {
    const request = await TxExecutionRequest.random();
    const buf = request.toBuffer();
    expect(TxExecutionRequest.fromBuffer(buf)).toEqual(request);
  });
});
