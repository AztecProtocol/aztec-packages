import { CHONK_PROOF_LENGTH } from '@aztec/constants';
import { times } from '@aztec/foundation/collection';
import { randomBytes } from '@aztec/foundation/crypto/random';
import { Fr } from '@aztec/foundation/curves/bn254';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

// CHONK: "Client Honk" - An UltraHonk variant with incremental folding and delayed non-native arithmetic.
export class ChonkProof {
  constructor(
    // The proof fields.
    // For native verification, attach public inputs via `attachPublicInputs(publicInputs)`.
    // Not using Tuple here due to the length being too high.
    public fields: Fr[],
  ) {
    if (fields.length !== CHONK_PROOF_LENGTH) {
      throw new Error(`Invalid ChonkProof length: ${fields.length}`);
    }
  }

  public attachPublicInputs(publicInputs: Fr[]) {
    return new ChonkProofWithPublicInputs([...publicInputs, ...this.fields]);
  }

  public isEmpty() {
    return this.fields.every(field => field.isZero());
  }

  static empty() {
    return new ChonkProof(new Array(CHONK_PROOF_LENGTH).fill(Fr.ZERO));
  }

  static random() {
    // NB: Not using Fr.random here because it slows down some tests that require a large number of txs significantly.
    // NB2: generate one fewer random bytes to not have to deal with buffers representing numbers greater than the field modulus
    // NB3: a chonk proof can be compressed. Simulate this by filling 1/4 of the proof with zero data
    const reducedFrSize = Fr.SIZE_IN_BYTES - 1;
    const nonZeroFields = Math.floor((3 * CHONK_PROOF_LENGTH) / 4);
    const randomFields = randomBytes(nonZeroFields * Fr.SIZE_IN_BYTES);
    const proof = [
      ...times(nonZeroFields, i => new Fr(randomFields.subarray(i * reducedFrSize, (i + 1) * reducedFrSize))),
      ...times(CHONK_PROOF_LENGTH - nonZeroFields, () => Fr.ZERO),
    ];
    return new ChonkProof(proof);
  }

  static get schema() {
    return bufferSchemaFor(ChonkProof);
  }

  // We use this in tandem with the bufferSchemaFor to serialize to base64 strings.
  toJSON() {
    return this.toBuffer();
  }

  static fromBuffer(buffer: Buffer | BufferReader): ChonkProof {
    const reader = BufferReader.asReader(buffer);
    const proofLength = reader.readNumber();
    const proof = reader.readArray(proofLength, Fr);
    return new ChonkProof(proof);
  }

  public toBuffer() {
    return serializeToBuffer(this.fields.length, this.fields);
  }
}

export class ChonkProofWithPublicInputs {
  constructor(
    // The proof fields with public inputs.
    // For recursive verification, use without public inputs via `removePublicInputs()`.
    public fieldsWithPublicInputs: Fr[],
  ) {
    if (fieldsWithPublicInputs.length < CHONK_PROOF_LENGTH) {
      throw new Error(`Invalid ChonkProofWithPublicInputs length: ${fieldsWithPublicInputs.length}`);
    }
  }

  public getPublicInputs() {
    const numPublicInputs = this.fieldsWithPublicInputs.length - CHONK_PROOF_LENGTH;
    return this.fieldsWithPublicInputs.slice(0, numPublicInputs);
  }

  public removePublicInputs() {
    const numPublicInputs = this.fieldsWithPublicInputs.length - CHONK_PROOF_LENGTH;
    return new ChonkProof(this.fieldsWithPublicInputs.slice(numPublicInputs));
  }

  public isEmpty() {
    return this.fieldsWithPublicInputs.every(field => field.isZero());
  }

  static empty() {
    return ChonkProof.empty().attachPublicInputs([]);
  }

  static get schema() {
    return bufferSchemaFor(ChonkProofWithPublicInputs);
  }

  // We use this in tandem with the bufferSchemaFor to serialize to base64 strings.
  toJSON() {
    return this.toBuffer();
  }

  static fromBuffer(buffer: Buffer | BufferReader): ChonkProofWithPublicInputs {
    const reader = BufferReader.asReader(buffer);
    const proofLength = reader.readNumber();
    const proof = reader.readArray(proofLength, Fr);
    return new ChonkProofWithPublicInputs(proof);
  }

  public toBuffer() {
    return serializeToBuffer(this.fieldsWithPublicInputs.length, this.fieldsWithPublicInputs);
  }

  // Called when constructing from bb proving results.
  static fromBufferArray(fields: Uint8Array[]): ChonkProofWithPublicInputs {
    const proof = fields.map(field => Fr.fromBuffer(Buffer.from(field)));
    return new ChonkProofWithPublicInputs(proof);
  }
}
