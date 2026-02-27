import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { TxHash } from '@aztec/stdlib/tx';

import { NoteValidationRequest } from './note_validation_request.js';

describe('NoteValidationRequest', () => {
  it('output of Noir serialization deserializes as expected', () => {
    const serialized = [
      '0x0000000000000000000000000000000000000000000000000000000000000001', // contract address
      '0x0000000000000000000000000000000000000000000000000000000000000032', // owner
      '0x0000000000000000000000000000000000000000000000000000000000000002', // storage slot
      '0x000000000000000000000000000000000000000000000000000000000000002a', // randomness
      '0x0000000000000000000000000000000000000000000000000000000000000003', // note nonce
      '0x0000000000000000000000000000000000000000000000000000000000000004', // content begin: note content 1
      '0x0000000000000000000000000000000000000000000000000000000000000005', // note content 2
      '0x0000000000000000000000000000000000000000000000000000000000000000',
      '0x0000000000000000000000000000000000000000000000000000000000000000',
      '0x0000000000000000000000000000000000000000000000000000000000000000',
      '0x0000000000000000000000000000000000000000000000000000000000000000',
      '0x0000000000000000000000000000000000000000000000000000000000000000',
      '0x0000000000000000000000000000000000000000000000000000000000000000', // content end (MAX_NOTE_CONTENT_LEN = 8)
      '0x0000000000000000000000000000000000000000000000000000000000000002', // content length
      '0x0000000000000000000000000000000000000000000000000000000000000006', // note hash
      '0x0000000000000000000000000000000000000000000000000000000000000007', // nullifier
      '0x0000000000000000000000000000000000000000000000000000000000000008', // tx hash
      '0x0000000000000000000000000000000000000000000000000000000000000009', // recipient
    ].map(Fr.fromHexString);

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

  // Older aztec-nr versions used a larger BoundedVec capacity. We need to support this for backward compatibility.
  it('accepts BoundedVec with capacity larger than MAX_NOTE_CONTENT_LEN if content length is valid', () => {
    const serialized = [
      1, // contract address
      2, // owner
      3, // storage slot
      4, // randomness
      5, // note nonce
      10, // content[0]
      11, // content[1]
      0,
      0,
      0,
      0,
      0,
      0,
      0, // padding to 9 storage fields (old BoundedVec capacity)
      2, // content length
      6, // note hash
      7, // nullifier
      8, // tx hash
      9, // recipient
    ].map(n => new Fr(n));

    const request = NoteValidationRequest.fromFields(serialized);

    expect(request.contractAddress).toEqual(AztecAddress.fromBigInt(1n));
    expect(request.content).toEqual([new Fr(10), new Fr(11)]);
    expect(request.noteHash).toEqual(new Fr(6));
  });

  it('throws if contentLen exceeds MAX_NOTE_CONTENT_LEN', () => {
    const serialized = [
      1, // contract address
      2, // owner
      3, // storage slot
      4, // randomness
      5, // note nonce
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18, // 9 storage fields
      9, // content length = 9, exceeds MAX_NOTE_CONTENT_LEN = 8
      6, // note hash
      7, // nullifier
      8, // tx hash
      9, // recipient
    ].map(n => new Fr(n));

    expect(() => NoteValidationRequest.fromFields(serialized)).toThrow(/exceeds MAX_NOTE_CONTENT_LEN/);
  });

  // Lowering MAX_NOTE_CONTENT_LEN would break deserialization of already-deployed contracts that use the current max.
  it('accepts contentLen = MAX_NOTE_CONTENT_LEN', () => {
    const serialized = [
      1, // contract address
      2, // owner
      3, // storage slot
      4, // randomness
      5, // note nonce
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17, // 8 storage fields
      8, // content length = 8 = MAX_NOTE_CONTENT_LEN
      6, // note hash
      7, // nullifier
      8, // tx hash
      9, // recipient
    ].map(n => new Fr(n));

    const request = NoteValidationRequest.fromFields(serialized);

    expect(request.content).toEqual([10, 11, 12, 13, 14, 15, 16, 17].map(n => new Fr(n)));
  });

  it('throws on malformed input that is too short', () => {
    const serialized = [
      1, // contract address
      2, // owner
      3, // storage slot
      4, // randomness
      5, // note nonce
      // missing BoundedVec storage + footer
    ].map(n => new Fr(n));

    expect(() => NoteValidationRequest.fromFields(serialized)).toThrow(/Malformed NoteValidationRequest/);
  });

  it('throws if contentLen exceeds BoundedVec storage capacity', () => {
    const serialized = [
      1, // contract address
      2, // owner
      3, // storage slot
      4, // randomness
      5, // note nonce
      10,
      11,
      12, // 3 storage fields
      4, // content length = 4, exceeds storage capacity of 3
      6, // note hash
      7, // nullifier
      8, // tx hash
      9, // recipient
    ].map(n => new Fr(n));

    expect(() => NoteValidationRequest.fromFields(serialized)).toThrow(/exceeds BoundedVec storage capacity/);
  });
});
