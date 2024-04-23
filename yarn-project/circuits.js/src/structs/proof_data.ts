import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { Proof, makeEmptyProof } from './proof.js';

export class ProofData {
  constructor(public readonly proof: Proof, public readonly vk: Buffer) {}

  /**
   * Create a ProofData from a Buffer or BufferReader.
   * Expects a length-encoding.
   *
   * @param buffer - A Buffer or BufferReader containing the length-encoded proof data.
   * @returns A ProofData instance containing the decoded proof data.
   */
  static fromBuffer(buffer: Buffer | BufferReader): ProofData {
    const reader = BufferReader.asReader(buffer);
    const proof = reader.readObject(Proof);
    const size = reader.readNumber();
    const buf = reader.readBytes(size);
    return new ProofData(proof, buf);
  }

  /**
   * Convert the ProofData instance to a custom Buffer format.
   * This function serializes the Proof's buffer length and data sequentially into a new Buffer.
   *
   * @returns A Buffer containing the serialized proof data in custom format.
   */
  public toBuffer() {
    return serializeToBuffer(this.proof, this.vk.length, this.vk);
  }

  public static empty() {
    return new ProofData(makeEmptyProof(), Buffer.alloc(0));
  }
}
