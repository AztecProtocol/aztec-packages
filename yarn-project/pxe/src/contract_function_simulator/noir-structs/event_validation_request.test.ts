import { Fr } from '@aztec/foundation/curves/bn254';
import { EventSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { TxHash } from '@aztec/stdlib/tx';

import { EventValidationRequest } from './event_validation_request.js';

describe('EventValidationRequest', () => {
  it('deserializes with default capacity when no capacity is given', () => {
    // 11 storage fields = default BoundedVec capacity (default)
    const serialized = [
      1, // contract_address
      2, // event_type_id
      3, // randomness
      4,
      5,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0, // 11 storage fields
      2, // bounded_vec_len
      6, // event_commitment
      7, // tx_hash
      8, // recipient
    ].map(n => new Fr(n));

    const request = EventValidationRequest.fromFields(serialized);

    expect(request.contractAddress).toEqual(AztecAddress.fromBigInt(1n));
    expect(request.eventTypeId).toEqual(new EventSelector(2));
    expect(request.randomness).toEqual(new Fr(3));
    expect(request.serializedEvent).toEqual([new Fr(4), new Fr(5)]);
    expect(request.eventCommitment).toEqual(new Fr(6));
    expect(request.txHash).toEqual(TxHash.fromBigInt(7n));
    expect(request.recipient).toEqual(AztecAddress.fromBigInt(8n));
  });

  it('deserializes with explicit capacity matching current capacity', () => {
    // 10 storage fields = current BoundedVec capacity
    const serialized = [
      1, // contract_address
      2, // event_type_id
      3, // randomness
      4,
      5,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0, // 10 storage fields
      2, // bounded_vec_len
      6, // event_commitment
      7, // tx_hash
      8, // recipient
    ].map(n => new Fr(n));

    const request = EventValidationRequest.fromFields(serialized, 10);

    expect(request.contractAddress).toEqual(AztecAddress.fromBigInt(1n));
    expect(request.serializedEvent).toEqual([new Fr(4), new Fr(5)]);
    expect(request.eventCommitment).toEqual(new Fr(6));
  });

  it('throws if capacity does not match actual field count (reader not exhausted)', () => {
    // Data has 11 storage fields but we claim capacity=10, leaving 1 unconsumed field
    const serialized = [
      1,
      2,
      3, // header
      10,
      11,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0, // 11 storage fields
      2, // bounded_vec_len
      6,
      7,
      8, // footer
    ].map(n => new Fr(n));

    expect(() => EventValidationRequest.fromFields(serialized, 10)).toThrow(/did not consume all fields/);
  });
});
