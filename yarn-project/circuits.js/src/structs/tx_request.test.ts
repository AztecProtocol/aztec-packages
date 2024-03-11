import { FunctionSelector } from '@aztec/foundation/abi';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';
import { updateInlineTestData } from '@aztec/foundation/testing';

import { TX_REQUEST_LENGTH } from '../constants.gen.js';
import { makeTxRequest } from '../tests/factories.js';
import { FunctionData } from './function_data.js';
import { TxContext } from './tx_context.js';
import { TxRequest } from './tx_request.js';

describe('TxRequest', () => {
  let request: TxRequest;

  beforeAll(() => {
    const randomInt = Math.floor(Math.random() * 1000);
    request = makeTxRequest(randomInt);
  });

  it(`serializes to buffer and deserializes it back`, () => {
    const buffer = request.toBuffer();
    const res = TxRequest.fromBuffer(buffer);
    expect(res).toEqual(request);
    expect(res.isEmpty()).toBe(false);
  });

  it('number of fields matches constant', () => {
    const fields = request.toFields();
    expect(fields.length).toBe(TX_REQUEST_LENGTH);
  });

  it('compute hash', () => {
    const txRequest = TxRequest.from({
      origin: AztecAddress.fromBigInt(1n),
      functionData: new FunctionData(FunctionSelector.fromField(new Fr(2n)), false, true, true),
      argsHash: new Fr(3),
      txContext: new TxContext(false, false, Fr.ZERO, Fr.ZERO),
    });

    const hash = txRequest.hash().toString();

    expect(hash).toMatchSnapshot();

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/transaction/tx_request.nr',
      'test_data_tx_request_hash',
      hash,
    );
  });
});
