import { CIVC_PROOF_LENGTH } from '@aztec/constants';
import { randomBytes } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

export class ClientIvcProof {
  constructor(
    // The proof fields.
    // For native verification, attach public inputs via `attachPublicInputs(publicInputs)`.
    // Not using Tuple here due to the length being too high.
    public fields: Fr[],
  ) {
    if (fields.length !== CIVC_PROOF_LENGTH) {
      throw new Error(`Invalid ClientIvcProof length: ${fields.length}`);
    }
  }

  public attachPublicInputs(publicInputs: Fr[]) {
    return new ClientIvcProofWithPublicInputs([...publicInputs, ...this.fields]);
  }

  public isEmpty() {
    return this.fields.every(field => field.isZero());
  }

  static empty() {
    return new ClientIvcProof(new Array(CIVC_PROOF_LENGTH).fill(Fr.ZERO));
  }

  static random() {
    // NB: Not using Fr.random here because it slows down some tests that require a large number of txs significantly.
    const reducedFrSize = Fr.SIZE_IN_BYTES - 1;
    const randomFields = randomBytes(CIVC_PROOF_LENGTH * reducedFrSize);
    const proof = Array.from(
      { length: CIVC_PROOF_LENGTH },
      (_, i) => new Fr(randomFields.subarray(i * reducedFrSize, (i + 1) * reducedFrSize)),
    );
    return new ClientIvcProof(proof);
  }

  static get schema() {
    return bufferSchemaFor(ClientIvcProof);
  }

  // We use this in tandem with the bufferSchemaFor to serialize to base64 strings.
  toJSON() {
    return this.toBuffer();
  }

  static fromBuffer(buffer: Buffer | BufferReader): ClientIvcProof {
    const reader = BufferReader.asReader(buffer);
    const proofLength = reader.readNumber();
    const proof = reader.readArray(proofLength, Fr);
    return new ClientIvcProof(proof);
  }

  public toBuffer() {
    return serializeToBuffer(this.fields.length, this.fields);
  }
}

export class ClientIvcProofWithPublicInputs {
  constructor(
    // The proof fields with public inputs.
    // For recursive verification, use without public inputs via `removePublicInputs()`.
    public fieldsWithPublicInputs: Fr[],
  ) {
    if (fieldsWithPublicInputs.length < CIVC_PROOF_LENGTH) {
      throw new Error(`Invalid ClientIvcProofWithPublicInputs length: ${fieldsWithPublicInputs.length}`);
    }
  }

  public getPublicInputs() {
    const numPublicInputs = this.fieldsWithPublicInputs.length - CIVC_PROOF_LENGTH;
    return this.fieldsWithPublicInputs.slice(0, numPublicInputs);
  }

  public removePublicInputs() {
    const numPublicInputs = this.fieldsWithPublicInputs.length - CIVC_PROOF_LENGTH;
    return new ClientIvcProof(this.fieldsWithPublicInputs.slice(numPublicInputs));
  }

  public isEmpty() {
    return this.fieldsWithPublicInputs.every(field => field.isZero());
  }

  static empty() {
    return ClientIvcProof.empty().attachPublicInputs([]);
  }

  static get schema() {
    return bufferSchemaFor(ClientIvcProofWithPublicInputs);
  }

  // We use this in tandem with the bufferSchemaFor to serialize to base64 strings.
  toJSON() {
    return this.toBuffer();
  }

  static fromBuffer(buffer: Buffer | BufferReader): ClientIvcProofWithPublicInputs {
    const reader = BufferReader.asReader(buffer);
    const proofLength = reader.readNumber();
    const proof = reader.readArray(proofLength, Fr);
    return new ClientIvcProofWithPublicInputs(proof);
  }

  public toBuffer() {
    return serializeToBuffer(this.fieldsWithPublicInputs.length, this.fieldsWithPublicInputs);
  }

  // Called when constructing from bb proving results.
  static fromBufferArray(fields: Uint8Array[]): ClientIvcProofWithPublicInputs {
    const proof = fields.map(field => Fr.fromBuffer(Buffer.from(field)));
    return new ClientIvcProofWithPublicInputs(proof);
  }
}
