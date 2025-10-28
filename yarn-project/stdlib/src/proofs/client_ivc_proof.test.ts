import { CIVC_PROOF_LENGTH } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';

import { ClientIvcProof, ClientIvcProofWithPublicInputs } from './client_ivc_proof.js';

describe('ClientIvcProof', () => {
  it('should throw error with incorrect length', () => {
    const fields = Array.from({ length: CIVC_PROOF_LENGTH + 1 }, () => Fr.random());
    expect(() => new ClientIvcProof(fields)).toThrow(`Invalid ClientIvcProof length: ${CIVC_PROOF_LENGTH + 1}`);
  });

  it('isEmpty should return true for empty proof', () => {
    const proof = ClientIvcProof.empty();
    expect(proof.isEmpty()).toBe(true);
  });

  it('should serialize and deserialize empty proof', () => {
    const original = ClientIvcProof.empty();
    const buffer = original.toBuffer();
    const deserialized = ClientIvcProof.fromBuffer(buffer);

    expect(deserialized.fields.length).toBe(original.fields.length);
    expect(deserialized.fields).toEqual(original.fields);
    expect(deserialized.isEmpty()).toBe(true);
  });

  it('should serialize and deserialize random proof', () => {
    const original = ClientIvcProof.random();
    const buffer = original.toBuffer();
    const deserialized = ClientIvcProof.fromBuffer(buffer);

    expect(deserialized.fields.length).toBe(original.fields.length);
    expect(deserialized.fields).toEqual(original.fields);
  });

  it('should attach public inputs', () => {
    const proof = ClientIvcProof.random();
    const publicInput = Fr.random();
    const withPublicInputs = proof.attachPublicInputs([publicInput]);

    expect(withPublicInputs.fieldsWithPublicInputs.length).toBe(CIVC_PROOF_LENGTH + 1);
    expect(withPublicInputs.fieldsWithPublicInputs[0]).toEqual(publicInput);
    expect(withPublicInputs.fieldsWithPublicInputs.slice(1)).toEqual(proof.fields);
  });
});

describe('ClientIvcProofWithPublicInputs', () => {
  it('constructor should throw error with length less than CIVC_PROOF_LENGTH', () => {
    const fields = Array.from({ length: CIVC_PROOF_LENGTH - 1 }, () => Fr.random());
    expect(() => new ClientIvcProofWithPublicInputs(fields)).toThrow(
      `Invalid ClientIvcProofWithPublicInputs length: ${CIVC_PROOF_LENGTH - 1}`,
    );
  });

  it('isEmpty should return true for empty proof', () => {
    const proof = ClientIvcProofWithPublicInputs.empty();
    expect(proof.isEmpty()).toBe(true);
  });

  it('should serialize and deserialize proof with public inputs', () => {
    const baseProof = ClientIvcProof.random();
    const publicInputs = Array.from({ length: 5 }, () => Fr.random());
    const original = baseProof.attachPublicInputs(publicInputs);
    const buffer = original.toBuffer();
    const deserialized = ClientIvcProofWithPublicInputs.fromBuffer(buffer);

    expect(deserialized.fieldsWithPublicInputs.length).toBe(CIVC_PROOF_LENGTH + 5);
    expect(deserialized.fieldsWithPublicInputs).toEqual(original.fieldsWithPublicInputs);
  });

  it('should be able to remove public inputs', () => {
    const baseProof = ClientIvcProof.random();
    const publicInputs = Array.from({ length: 10 }, () => Fr.random());
    const withPublicInputs = baseProof.attachPublicInputs(publicInputs);
    const removed = withPublicInputs.removePublicInputs();

    expect(removed.fields.length).toBe(CIVC_PROOF_LENGTH);
    expect(removed.fields).toEqual(baseProof.fields);
  });
});
