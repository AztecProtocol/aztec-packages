import { Fr } from '@aztec/foundation/curves/bn254';
import { EventSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { TxHash } from '@aztec/stdlib/tx';

import { EventValidationRequest } from './event_validation_request.js';

describe('EventValidationRequest', () => {
  it('output of Noir serialization deserializes as expected', () => {
    const serialized = [
      1, // contract_address
      2, // event_type_id
      3, // randomness
      4, // serialized_event[0]
      5, // serialized_event[1]
      0, // serialized_event padding start
      0,
      0,
      0,
      0,
      0,
      0,
      0, // serialized_event padding end
      2, // bounded_vec_len
      6, // event_commitment
      7, // tx_hash
      8, // recipient
    ].map(n => new Fr(n));

    const request = EventValidationRequest.fromFields(serialized, 10);

    expect(request.contractAddress).toEqual(AztecAddress.fromBigInt(1n));
    expect(request.eventTypeId).toEqual(new EventSelector(2));
    expect(request.randomness).toEqual(new Fr(3));
    expect(request.serializedEvent).toEqual([new Fr(4), new Fr(5)]);
    expect(request.eventCommitment).toEqual(new Fr(6));
    expect(request.txHash).toEqual(TxHash.fromBigInt(7n));
    expect(request.recipient).toEqual(AztecAddress.fromBigInt(8n));
  });

  it('throws if fed more fields than expected', () => {
    const serialized = [
      1, // contract_address
      2, // event_type_id
      3, // randomness
      4, // serialized_event[0]
      5, // serialized_event[1]
      0, // serialized_event padding (11 storage fields total, but maxEventSerializedLen=10)
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      2, // bounded_vec_len
      6, // event_commitment
      7, // tx_hash
      8, // recipient
    ].map(n => new Fr(n));

    expect(() => EventValidationRequest.fromFields(serialized, 10)).toThrow(
      'Error converting array of fields to EventValidationRequest: expected 17 fields but received 18 (maxEventSerializedLen=10).',
    );
  });
});
