import { CIVC_PROOF_LENGTH } from '@aztec/constants';
import { randomBytes } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

export class ClientIvcProof {
  constructor(
    // The proof fields with public inputs.
    // For recursive verification, the public inputs (at the front of the array) must be removed.
    public proof: Fr[],
  ) {}

  public isEmpty() {
    return this.proof.length === 0;
  }

  static empty() {
    return new ClientIvcProof([]);
  }

  static random(proofSize = CIVC_PROOF_LENGTH) {
    // NB: Not using Fr.random here because it slows down some tests that require a large number of txs significantly.
    const reducedFrSize = Fr.SIZE_IN_BYTES - 1;
    const randomFields = randomBytes(proofSize * reducedFrSize);
    const proof = Array.from(
      { length: proofSize },
      (_, i) => new Fr(randomFields.subarray(i * reducedFrSize, (i + 1) * reducedFrSize)),
    );
    return new ClientIvcProof(proof);
  }

  static get schema() {
    return bufferSchemaFor(ClientIvcProof);
  }

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
    return serializeToBuffer(this.proof.length, this.proof);
  }

  // Called when constructing a ClientIvcProof from proving results.
  static fromBufferArray(fields: Uint8Array[]): ClientIvcProof {
    const proof = fields.map(field => Fr.fromBuffer(Buffer.from(field)));
    return new ClientIvcProof(proof);
  }
}
