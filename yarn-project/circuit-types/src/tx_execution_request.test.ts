import { jsonStringify } from '@aztec/foundation/json-rpc';

import { jsonParseWithSchema } from '../../foundation/src/json-rpc/convert.js';
import { TxExecutionRequest } from './tx_execution_request.js';

describe('TxExecutionRequest', () => {
  it('serializes and deserializes', () => {
    const request = TxExecutionRequest.random();
    const json = jsonStringify(request);
    expect(jsonParseWithSchema(json, TxExecutionRequest.schema)).toEqual(request);
  });
});
