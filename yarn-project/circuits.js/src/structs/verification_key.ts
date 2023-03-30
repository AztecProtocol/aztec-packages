import { BufferReader, Fr } from '@aztec/foundation';
import { serializeToBuffer } from '../utils/serialize.js';
import { ComposerType } from './shared.js';

/**
 * Curve data.
 */
export class G1AffineElement {
  constructor(public x: Fr, public y: Fr) {}
  /**
   * Serialize as a buffer.
   * @returns The buffer.
   */
  toBuffer() {
    return serializeToBuffer(this.x, this.y);
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer to read from.
   */
  static fromBuffer(buffer: Buffer | BufferReader): G1AffineElement {
    const reader = BufferReader.asReader(buffer);
    return new G1AffineElement(reader.readFr(), reader.readFr());
  }
}

/**
 *
 */
export class CommitmentMap {
  constructor(public record: { [name: string]: G1AffineElement }) {}
  /**
   * Serialize as a buffer.
   * @returns The buffer.
   */
  toBuffer() {
    const values = Object.entries(this.record);
    return serializeToBuffer(values.length, ...values.flat());
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer to read from.
   */
  static fromBuffer(buffer: Buffer | BufferReader): CommitmentMap {
    const reader = BufferReader.asReader(buffer);
    return new CommitmentMap(reader.readMap(G1AffineElement));
  }
}

/**
 * Kate commitment key object for verifying pairing equations.
 * @see proof_system/verification_key/verification_key.hpp
 */
export class VerificationKey {
  constructor(
    /**
     * Composer prover type we're using.
     */
    public composerType: ComposerType,
    /**
     * The number of gates in this circuit.
     */
    public circuitSize: number,
    /**
     * The number of public inputs in this circuit.
     */
    public numPublicInputs: number,
    /**
     * The commitments for this circuit.
     */
    public commitments: CommitmentMap,
    /**
     * Contains a recursive proof?
     */
    public containsRecursiveProof: boolean,
    /**
     * Recursion stack.
     */
    public recursiveProofPublicInputIndices: number[],
  ) {}

  /**
   * Serialize as a buffer.
   * @returns The buffer.
   */
  toBuffer() {
    return serializeToBuffer(
      this.composerType,
      this.circuitSize,
      this.numPublicInputs,
      this.commitments,
      this.containsRecursiveProof,
      serializeToBuffer(this.recursiveProofPublicInputIndices.length, this.recursiveProofPublicInputIndices),
    );
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer to read from.
   */
  static fromBuffer(buffer: Buffer | BufferReader): VerificationKey {
    const reader = BufferReader.asReader(buffer);
    return new VerificationKey(
      reader.readNumber(),
      reader.readNumber(),
      reader.readNumber(),
      reader.readObject(CommitmentMap),
      reader.readBoolean(),
      reader.readNumberVector(),
    );
  }
}
