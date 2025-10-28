import { CHONK_PROOF_LENGTH } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';

import { ChonkProof, ChonkProofWithPublicInputs } from './chonk_proof.js';

describe('ChonkProof', () => {
  it('should throw error with incorrect length', () => {
    const fields = Array.from({ length: CHONK_PROOF_LENGTH + 1 }, () => Fr.random());
    expect(() => new ChonkProof(fields)).toThrow(`Invalid ChonkProof length: ${CHONK_PROOF_LENGTH + 1}`);
  });

  it('isEmpty should return true for empty proof', () => {
    const proof = ChonkProof.empty();
    expect(proof.isEmpty()).toBe(true);
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
