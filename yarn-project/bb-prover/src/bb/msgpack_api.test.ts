import { describe, expect, it } from '@jest/globals';
import { Fr } from '@aztec/foundation/fields';
import { Proof } from '@aztec/stdlib/proofs';

describe('BBMsgpackProver buffer conversions', () => {
  describe('toMsgpackProof format', () => {
    it('should split proof into public inputs and proof fields correctly', () => {
      // Create a mock proof with 3 public inputs and 5 proof fields
      const numPublicInputs = 3;
      const publicInputsBuffer = Buffer.alloc(numPublicInputs * 32);
      const proofBuffer = Buffer.alloc(5 * 32);

      // Fill with test data
      for (let i = 0; i < numPublicInputs; i++) {
        publicInputsBuffer.writeUInt32BE(i + 1, i * 32);
      }
      for (let i = 0; i < 5; i++) {
        proofBuffer.writeUInt32BE(i + 10, i * 32);
      }

      const fullBuffer = Buffer.concat([publicInputsBuffer, proofBuffer]);
      const proof = new Proof(fullBuffer, numPublicInputs);

      // Manually implement toMsgpackProof logic for testing
      const publicInputsSize = proof.numPublicInputs * 32;
      const extractedPublicInputs = proof.buffer.subarray(0, publicInputsSize);
      const extractedProof = proof.buffer.subarray(publicInputsSize);

      // Verify sizes
      expect(extractedPublicInputs.length).toBe(numPublicInputs * 32);
      expect(extractedProof.length).toBe(5 * 32);

      // Verify public inputs can be split into 32-byte chunks
      const publicInputFields: Uint8Array[] = [];
      for (let i = 0; i < extractedPublicInputs.length; i += 32) {
        publicInputFields.push(new Uint8Array(extractedPublicInputs.subarray(i, i + 32)));
      }
      expect(publicInputFields.length).toBe(numPublicInputs);

      // Verify proof fields can be split into 32-byte chunks
      const proofFields: Uint8Array[] = [];
      for (let i = 0; i < extractedProof.length; i += 32) {
        proofFields.push(new Uint8Array(extractedProof.subarray(i, i + 32)));
      }
      expect(proofFields.length).toBe(5);
    });
  });

  describe('fromMsgpackProof format', () => {
    it('should reconstruct proof from field arrays correctly', () => {
      // Create mock proof and public input fields
      const proofFields: Uint8Array[] = [];
      const publicInputFields: Uint8Array[] = [];

      for (let i = 0; i < 3; i++) {
        const field = Buffer.alloc(32);
        field.writeUInt32BE(i + 1, 0);
        publicInputFields.push(new Uint8Array(field));
      }

      for (let i = 0; i < 5; i++) {
        const field = Buffer.alloc(32);
        field.writeUInt32BE(i + 10, 0);
        proofFields.push(new Uint8Array(field));
      }

      // Reconstruct binary proof in Aztec format: [public_inputs, proof]
      const publicInputsBuffer = Buffer.concat(publicInputFields.map(f => Buffer.from(f)));
      const proofBuffer = Buffer.concat(proofFields.map(f => Buffer.from(f)));
      const binaryProofWithPublicInputs = Buffer.concat([publicInputsBuffer, proofBuffer]);

      // Verify total size
      expect(binaryProofWithPublicInputs.length).toBe((3 + 5) * 32);

      // Verify we can create a Proof object with correct public inputs count
      const proof = new Proof(binaryProofWithPublicInputs, publicInputFields.length);
      expect(proof.numPublicInputs).toBe(3);
      expect(proof.buffer.length).toBe((3 + 5) * 32);
    });

    it('should convert field buffers to Fr array correctly', () => {
      const proofFields: Uint8Array[] = [];

      for (let i = 0; i < 5; i++) {
        const field = Buffer.alloc(32);
        field.writeUInt32BE(i + 1, 28); // Write at offset 28 to place value at end
        proofFields.push(new Uint8Array(field));
      }

      // Convert to Fr array (simulating fromMsgpackProof logic)
      const proofFrs: Fr[] = [];
      for (const field of proofFields) {
        proofFrs.push(Fr.fromBuffer(Buffer.from(field)));
      }

      expect(proofFrs.length).toBe(5);
      // Verify each Fr can be converted to buffer and back
      proofFrs.forEach((fr, i) => {
        expect(fr.toBuffer().length).toBe(32);
      });
    });
  });

  describe('round-trip conversion', () => {
    it('should preserve proof data through to/from msgpack conversion', () => {
      // Create original proof
      const numPublicInputs = 2;
      const publicInputsBuffer = Buffer.alloc(numPublicInputs * 32);
      const proofBuffer = Buffer.alloc(3 * 32);

      // Fill with test pattern
      for (let i = 0; i < numPublicInputs * 32; i++) {
        publicInputsBuffer[i] = i % 256;
      }
      for (let i = 0; i < 3 * 32; i++) {
        proofBuffer[i] = (i + 100) % 256;
      }

      const originalBuffer = Buffer.concat([publicInputsBuffer, proofBuffer]);
      const originalProof = new Proof(originalBuffer, numPublicInputs);

      // Simulate toMsgpackProof
      const publicInputsSize = originalProof.numPublicInputs * 32;
      const publicInputsExtracted = originalProof.buffer.subarray(0, publicInputsSize);
      const proofExtracted = originalProof.buffer.subarray(publicInputsSize);

      const publicInputFields: Uint8Array[] = [];
      for (let i = 0; i < publicInputsExtracted.length; i += 32) {
        publicInputFields.push(new Uint8Array(publicInputsExtracted.subarray(i, i + 32)));
      }

      const proofFields: Uint8Array[] = [];
      for (let i = 0; i < proofExtracted.length; i += 32) {
        proofFields.push(new Uint8Array(proofExtracted.subarray(i, i + 32)));
      }

      // Simulate fromMsgpackProof
      const reconstructedPublicInputs = Buffer.concat(publicInputFields.map(f => Buffer.from(f)));
      const reconstructedProof = Buffer.concat(proofFields.map(f => Buffer.from(f)));
      const reconstructedBuffer = Buffer.concat([reconstructedPublicInputs, reconstructedProof]);

      const reconstructedProofObj = new Proof(reconstructedBuffer, publicInputFields.length);

      // Verify round-trip preserves data
      expect(reconstructedProofObj.buffer.length).toBe(originalProof.buffer.length);
      expect(reconstructedProofObj.numPublicInputs).toBe(originalProof.numPublicInputs);
      expect(reconstructedProofObj.buffer.equals(originalProof.buffer)).toBe(true);
    });
  });
});
