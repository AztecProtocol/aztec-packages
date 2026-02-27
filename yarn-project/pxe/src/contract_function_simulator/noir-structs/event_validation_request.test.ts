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

    const request = EventValidationRequest.fromFields(serialized);

    expect(request.contractAddress).toEqual(AztecAddress.fromBigInt(1n));
    expect(request.eventTypeId).toEqual(new EventSelector(2));
    expect(request.randomness).toEqual(new Fr(3));
    expect(request.serializedEvent).toEqual([new Fr(4), new Fr(5)]);
    expect(request.eventCommitment).toEqual(new Fr(6));
    expect(request.txHash).toEqual(TxHash.fromBigInt(7n));
    expect(request.recipient).toEqual(AztecAddress.fromBigInt(8n));
  });

  // Older aztec-nr versions used a larger BoundedVec capacity. We need to support this for backward compatibility.
  it('accepts BoundedVec with capacity larger than MAX_EVENT_CONTENT_LEN if content length is valid', () => {
    const serialized = [
      1, // contract_address
      2, // event_type_id
      3, // randomness
      10, // serialized_event[0]
      11, // serialized_event[1]
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0, // padding to 11 storage fields (old BoundedVec capacity)
      2, // bounded_vec_len
      6, // event_commitment
      7, // tx_hash
      8, // recipient
    ].map(n => new Fr(n));

    const request = EventValidationRequest.fromFields(serialized);

    expect(request.contractAddress).toEqual(AztecAddress.fromBigInt(1n));
    expect(request.serializedEvent).toEqual([new Fr(10), new Fr(11)]);
    expect(request.eventCommitment).toEqual(new Fr(6));
  });

  it('throws if eventLen exceeds MAX_EVENT_CONTENT_LEN', () => {
    const serialized = [
      1, // contract_address
      2, // event_type_id
      3, // randomness
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18,
      19,
      20, // 11 storage fields
      11, // bounded_vec_len = 11, exceeds MAX_EVENT_CONTENT_LEN = 10
      6, // event_commitment
      7, // tx_hash
      8, // recipient
    ].map(n => new Fr(n));

    expect(() => EventValidationRequest.fromFields(serialized)).toThrow(/exceeds MAX_EVENT_CONTENT_LEN/);
  });

  // Lowering MAX_EVENT_CONTENT_LEN would break deserialization of already-deployed contracts that use the current max.
  it('accepts eventLen = MAX_EVENT_CONTENT_LEN', () => {
    const serialized = [
      1, // contract_address
      2, // event_type_id
      3, // randomness
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18,
      19, // 10 storage fields
      10, // bounded_vec_len = 10 = MAX_EVENT_CONTENT_LEN
      6, // event_commitment
      7, // tx_hash
      8, // recipient
    ].map(n => new Fr(n));

    const request = EventValidationRequest.fromFields(serialized);

    expect(request.serializedEvent).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map(n => new Fr(n)));
  });

  it('throws on malformed input that is too short', () => {
    const serialized = [
      1, // contract_address
      2, // event_type_id
      3, // randomness
      // missing BoundedVec storage + footer
    ].map(n => new Fr(n));

    expect(() => EventValidationRequest.fromFields(serialized)).toThrow(/Malformed EventValidationRequest/);
  });

  it('throws if eventLen exceeds BoundedVec storage capacity', () => {
    const serialized = [
      1, // contract_address
      2, // event_type_id
      3, // randomness
      10,
      11,
      12, // 3 storage fields
      4, // bounded_vec_len = 4, exceeds storage capacity of 3
      6, // event_commitment
      7, // tx_hash
      8, // recipient
    ].map(n => new Fr(n));

    expect(() => EventValidationRequest.fromFields(serialized)).toThrow(/exceeds BoundedVec storage capacity/);
  });
});
