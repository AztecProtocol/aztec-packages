import { makeTuple } from '@aztec/foundation/array';
import { Fq, Fr } from '@aztec/foundation/fields';
import { BufferReader, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';

/**
 * Curve data.
 */
export class G1AffineElement {
  /**
   * Element's x coordinate.
   */
  public x: Fq;
  /**
   * Element's y coordinate.
   */
  public y: Fq;

  constructor(x: Fq | bigint, y: Fq | bigint) {
    this.x = typeof x === 'bigint' ? new Fq(x) : x;
    this.y = typeof y === 'bigint' ? new Fq(y) : y;
  }
  /**
   * Serialize as a buffer.
   * @returns The buffer.
   */
  toBuffer() {
    return serializeToBuffer(this.x, this.y);
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer  or BufferReader to read from.
   * @returns The G1AffineElement.
   */
  static fromBuffer(buffer: Buffer | BufferReader): G1AffineElement {
    const reader = BufferReader.asReader(buffer);
    return new G1AffineElement(Fq.fromBuffer(reader), Fq.fromBuffer(reader));
  }
}

/**
 * Used store and serialize a key-value map of commitments where key is the name of the commitment and value is
 * the commitment itself. The name can be e.g. Q_1, Q_2, SIGMA_1 etc.
 */
export class CommitmentMap {
  constructor(
    /**
     * An object used to store the commitments.
     */
    public record: { [name: string]: G1AffineElement },
  ) {}

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
   * @param buffer - Buffer or BufferReader to read from.
   * @returns The CommitmentMap.
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
  constructor(public key: Tuple<Fr, typeof NUM_FIELDS_IN_VK>, public hash: Fr) {}

  /**
   * Serialize as a buffer.
   * @returns The buffer.
   */
  toBuffer() {
    return serializeToBuffer(this.key, this.hash);
  }
  toFields() {
    return [...this.key, this.hash];
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer to read from.
   * @returns The VerificationKey.
   */
  static fromBuffer(buffer: Buffer | BufferReader): VerificationKey {
    const reader = BufferReader.asReader(buffer);
    return new VerificationKey(reader.readArray(NUM_FIELDS_IN_VK, Fr), reader.readObject(Fr));
  }

  /**
   * Builds a fake verification key that should be accepted by circuits.
   * @returns A fake verification key.
   */
  static makeFake(seed = 1): VerificationKey {
    return new VerificationKey(makeTuple(NUM_FIELDS_IN_VK, Fr.random, seed), Fr.random());
  }
}
