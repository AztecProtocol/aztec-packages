import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { TxHash } from '@aztec/stdlib/tx';

import { NoteValidationRequest } from './note_validation_request.js';

describe('NoteValidationRequest', () => {
  it('deserializes with default capacity when no capacity is given', () => {
    // 9 storage fields = old BoundedVec capacity (default)
    const serialized = [
      1, // contract address
      50, // owner
      2, // storage slot
      42, // randomness
      3, // note nonce
      4,
      5,
      0,
      0,
      0,
      0,
      0,
      0,
      0, // 9 storage fields
      2, // content length
      6, // note hash
      7, // nullifier
      8, // tx hash
      9, // recipient
    ].map(n => new Fr(n));

    const request = NoteValidationRequest.fromFields(serialized);

    expect(request.contractAddress).toEqual(AztecAddress.fromBigInt(1n));
    expect(request.owner).toEqual(AztecAddress.fromBigInt(50n));
    expect(request.storageSlot).toEqual(new Fr(2));
    expect(request.randomness).toEqual(new Fr(42));
    expect(request.noteNonce).toEqual(new Fr(3));
    expect(request.content).toEqual([new Fr(4), new Fr(5)]);
    expect(request.noteHash).toEqual(new Fr(6));
    expect(request.nullifier).toEqual(new Fr(7));
    expect(request.txHash).toEqual(TxHash.fromBigInt(8n));
    expect(request.recipient).toEqual(AztecAddress.fromBigInt(9n));
  });

  it('deserializes with explicit capacity matching current capacity', () => {
    // 8 storage fields = current BoundedVec capacity
    const serialized = [
      1, // contract address
      50, // owner
      2, // storage slot
      42, // randomness
      3, // note nonce
      4,
      5,
      0,
      0,
      0,
      0,
      0,
      0, // 8 storage fields
      2, // content length
      6, // note hash
      7, // nullifier
      8, // tx hash
      9, // recipient
    ].map(n => new Fr(n));

    const request = NoteValidationRequest.fromFields(serialized, 8);

    expect(request.contractAddress).toEqual(AztecAddress.fromBigInt(1n));
    expect(request.content).toEqual([new Fr(4), new Fr(5)]);
    expect(request.noteHash).toEqual(new Fr(6));
  });

  it('throws if capacity does not match actual field count (reader not exhausted)', () => {
    // Data has 9 storage fields but we claim capacity=8, leaving 1 unconsumed field
    const serialized = [
      1,
      2,
      3,
      4,
      5, // header
      10,
      11,
      0,
      0,
      0,
      0,
      0,
      0,
      0, // 9 storage fields
      2, // content length
      6,
      7,
      8,
      9, // footer
    ].map(n => new Fr(n));

    expect(() => NoteValidationRequest.fromFields(serialized, 8)).toThrow(/did not consume all fields/);
  });
});
