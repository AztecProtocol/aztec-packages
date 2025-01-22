import { jsonParseWithSchema, jsonStringify } from '@aztec/foundation/json-rpc';

import { TxExecutionRequest } from './tx_execution_request.js';

describe('TxExecutionRequest', () => {
  it('serializes and deserializes', async () => {
    const request = await TxExecutionRequest.random();
    const json = jsonStringify(request);
    expect(jsonParseWithSchema(json, TxExecutionRequest.schema)).toEqual(request);
  });
});
