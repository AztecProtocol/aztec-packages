import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { Tag } from '@aztec/stdlib/logs';

import { LogRetrievalRequest } from './log_retrieval_request.js';

describe('LogRetrievalRequest', () => {
  it('output of Noir serialization deserializes as expected', () => {
    const serialized = [
      '0x0000000000000000000000000000000000000000000000000000000000000001',
      '0x0000000000000000000000000000000000000000000000000000000000000002',
    ].map(Fr.fromHexString);

    const request = LogRetrievalRequest.fromFields(serialized);

    expect(request.contractAddress).toEqual(AztecAddress.fromBigInt(1n));
    expect(request.tag).toEqual(new Tag(new Fr(2)));
  });
});
