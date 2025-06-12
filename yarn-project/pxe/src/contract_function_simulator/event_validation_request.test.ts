import { Fr } from '@aztec/foundation/fields';
import { EventSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { TxHash } from '@aztec/stdlib/tx';

import { EventValidationRequest } from './event_validation_request.js';

describe('EventValidationRequest', () => {
  it('output of Noir serialization deserializes as expected', () => {
    const serialized = [
      1, // contract_address
      2, // event_type_id
      3, // serialized_event[0]
      4, // serialized_event[1]
      0, // serialized_event padding start
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0, // serialized_event padding end
      2, // bounded_vec_len
      5, // event_commitment
      6, // tx_hash
      7, // recipient
      8, // log_index_in_tx
      9, // tx_index_in_block
    ].map(n => new Fr(n));

    const request = EventValidationRequest.fromFields(serialized);

    expect(request.contractAddress).toEqual(AztecAddress.fromBigInt(1n));
    expect(request.eventTypeId).toEqual(new EventSelector(2));
    expect(request.serializedEvent).toEqual([new Fr(3), new Fr(4)]);
    expect(request.eventCommitment).toEqual(new Fr(5));
    expect(request.txHash).toEqual(TxHash.fromBigInt(6n));
    expect(request.recipient).toEqual(AztecAddress.fromBigInt(7n));
    expect(request.logIndexInTx).toEqual(8);
    expect(request.txIndexInBlock).toEqual(9);
  });
});
