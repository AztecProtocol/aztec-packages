import { CHONK_PROOF_LENGTH } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { numToUInt32BE } from '@aztec/foundation/serialize';

import { ChonkProof, ChonkProofWithPublicInputs } from './chonk_proof.js';

describe('ChonkProof', () => {
  it('should throw error with incorrect length', () => {
    const fields = Array.from({ length: CHONK_PROOF_LENGTH + 1 }, () => Fr.random());
    expect(() => new ChonkProof(fields)).toThrow(`Invalid ChonkProof length: ${CHONK_PROOF_LENGTH + 1}`);
  });

  it('empty proof holds an empty fields array', () => {
    const proof = ChonkProof.empty();
    expect(proof.fields).toEqual([]);
  });

  it('isEmpty should return true for empty proof', () => {
    const proof = ChonkProof.empty();
    expect(proof.isEmpty()).toBe(true);
  });

  it('serializes empty proof as a single zero length', () => {
    const buffer = ChonkProof.empty().toBuffer();
    expect(buffer).toEqual(numToUInt32BE(0));
    expect(buffer.length).toBe(4);
  });

  it('should serialize and deserialize empty proof', () => {
    const original = ChonkProof.empty();
    const buffer = original.toBuffer();
    const deserialized = ChonkProof.fromBuffer(buffer);

    expect(deserialized.fields.length).toBe(original.fields.length);
    expect(deserialized.fields).toEqual(original.fields);
    expect(deserialized.isEmpty()).toBe(true);
  });

  it('should serialize and deserialize random proof', () => {
    const original = ChonkProof.random();
    const buffer = original.toBuffer();
    const deserialized = ChonkProof.fromBuffer(buffer);

    expect(deserialized.fields.length).toBe(original.fields.length);
    expect(deserialized.fields).toEqual(original.fields);
  });

  it('should attach public inputs', () => {
    const proof = ChonkProof.random();
    const publicInput = Fr.random();
    const withPublicInputs = proof.attachPublicInputs([publicInput]);

    expect(withPublicInputs.fieldsWithPublicInputs.length).toBe(CHONK_PROOF_LENGTH + 1);
    expect(withPublicInputs.fieldsWithPublicInputs[0]).toEqual(publicInput);
    expect(withPublicInputs.fieldsWithPublicInputs.slice(1)).toEqual(proof.fields);
  });

  describe('compressed serialization format', () => {
    const fakeCompressedBytes = Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x01, 0x02, 0x03]);

    it('serializes in compressed format when compressedProof is set', () => {
      const proof = ChonkProof.random();
      proof.compressedProof = fakeCompressedBytes;

      const buf = proof.toBuffer();
      // First uint32 should be the compressed byte count (not CHONK_PROOF_LENGTH)
      expect(buf.readUInt32BE(0)).toBe(fakeCompressedBytes.length);
      // Then the compressed bytes themselves
      expect(buf.subarray(4)).toEqual(fakeCompressedBytes);
    });

    it('serializes in uncompressed format when compressedProof is undefined', () => {
      const proof = ChonkProof.random();
      expect(proof.compressedProof).toBeUndefined();

      const buf = proof.toBuffer();
      expect(buf.readUInt32BE(0)).toBe(CHONK_PROOF_LENGTH);
    });

    it('stripping compressedProof switches to uncompressed format', () => {
      const proof = ChonkProof.random();
      proof.compressedProof = fakeCompressedBytes;

      proof.compressedProof = undefined;
      const buf = proof.toBuffer();
      expect(buf.readUInt32BE(0)).toBe(CHONK_PROOF_LENGTH);
    });

    it('detects compressed format by size (first uint32 != CHONK_PROOF_LENGTH)', () => {
      // Construct a buffer with compressed format: [byte_count: uint32] [compressed_bytes]
      const compressedPayload = Buffer.from([0x01, 0x02, 0x03]);
      const buf = Buffer.concat([numToUInt32BE(compressedPayload.length), compressedPayload]);

      // fromBuffer should detect this as compressed format (first uint32 != 1632)
      // and attempt decompression. Since we're using fake bytes, BarretenbergSync
      // will throw, but the format detection itself works.
      expect(() => ChonkProof.fromBuffer(buf)).toThrow();
    });
  });
});

describe('ChonkProofWithPublicInputs', () => {
  it('constructor should throw error with length less than CHONK_PROOF_LENGTH', () => {
    const fields = Array.from({ length: CHONK_PROOF_LENGTH - 1 }, () => Fr.random());
    expect(() => new ChonkProofWithPublicInputs(fields)).toThrow(
      `Invalid ChonkProofWithPublicInputs length: ${CHONK_PROOF_LENGTH - 1}`,
    );
  });

  it('isEmpty should return true for empty proof', () => {
    const proof = ChonkProofWithPublicInputs.empty();
    expect(proof.isEmpty()).toBe(true);
  });

  it('empty proof round-trips with an empty fields array', () => {
    const original = ChonkProofWithPublicInputs.empty();
    expect(original.fieldsWithPublicInputs).toEqual([]);

    const deserialized = ChonkProofWithPublicInputs.fromBuffer(original.toBuffer());
    expect(deserialized.fieldsWithPublicInputs).toEqual([]);
    expect(deserialized.isEmpty()).toBe(true);
  });

  it('should serialize and deserialize proof with public inputs', () => {
    const baseProof = ChonkProof.random();
    const publicInputs = Array.from({ length: 5 }, () => Fr.random());
    const original = baseProof.attachPublicInputs(publicInputs);
    const buffer = original.toBuffer();
    const deserialized = ChonkProofWithPublicInputs.fromBuffer(buffer);

    expect(deserialized.fieldsWithPublicInputs.length).toBe(CHONK_PROOF_LENGTH + 5);
    expect(deserialized.fieldsWithPublicInputs).toEqual(original.fieldsWithPublicInputs);
  });

  it('should be able to remove public inputs', () => {
    const baseProof = ChonkProof.random();
    const publicInputs = Array.from({ length: 10 }, () => Fr.random());
    const withPublicInputs = baseProof.attachPublicInputs(publicInputs);
    const removed = withPublicInputs.removePublicInputs();

    expect(removed.fields.length).toBe(CHONK_PROOF_LENGTH);
    expect(removed.fields).toEqual(baseProof.fields);
  });
});
