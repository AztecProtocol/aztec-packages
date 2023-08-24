import { Fr } from '@aztec/foundation/fields';

import { FunctionSelector } from '../../../foundation/src/abi/function_selector.js';
import { expectSerializeToMatchSnapshot } from '../tests/expectSerialize.js';
import { FunctionLeafPreimage } from './function_leaf_preimage.js';

describe('basic FunctionLeafPreimage serialization', () => {
  it(`serializes a trivial Function Leaf Preimage and prints it`, async () => {
    // Test the data case: writing (mostly) sequential numbers
    await expectSerializeToMatchSnapshot(
      new FunctionLeafPreimage(new FunctionSelector(8972), false, true, Fr.ZERO, Fr.ZERO).toBuffer(),
      'abis__test_roundtrip_serialize_function_leaf_preimage',
    );
  });
});
