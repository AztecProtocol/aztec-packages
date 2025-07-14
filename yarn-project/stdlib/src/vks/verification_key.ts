import {
  ULTRA_HONK_VK_LENGTH_IN_FIELDS,
} from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { times } from '@aztec/foundation/collection';
import { Fq, Fr } from '@aztec/foundation/fields';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { hashVK } from '../hash/index.js';
import { CircuitType } from '../types/shared.js';

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

// TODO: find better home for these constants
export const CIRCUIT_SIZE_INDEX = 0;
export const CIRCUIT_PUBLIC_INPUTS_INDEX = 1;
export const CIRCUIT_RECURSIVE_INDEX = 3;

/**
 * Provides a 'fields' representation of a circuit's verification key
 */
export class VerificationKeyAsFields {
  constructor(
    public key: Fr[],
    public hash: Fr,
  ) {}

  static async fromKey(key: Fr[]) {
    const hash = await hashVK(key);
    return new VerificationKeyAsFields(key, hash);
  }

  public get numPublicInputs() {
    return Number(this.key[CIRCUIT_PUBLIC_INPUTS_INDEX]);
  }

  public get circuitSize() {
    return Number(this.key[CIRCUIT_SIZE_INDEX]);
  }

  public get isRecursive() {
    return this.key[CIRCUIT_RECURSIVE_INDEX].equals(Fr.ONE);
  }

  static get schema() {
    // TODO(palla/schemas): Should we verify the hash matches the key when deserializing?
    return bufferSchemaFor(VerificationKeyAsFields);
  }

  toJSON() {
    return this.toBuffer();
  }

  /**
   * Serialize as a buffer.
   * @returns The buffer.
   */
  toBuffer() {
    return serializeToBuffer(...this.toFields());
  }

  toFields() {
    return [this.key.length, ...this.key, this.hash];
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer to read from.
   * @returns The VerificationKeyAsFields.
   */
  static fromBuffer(buffer: Buffer | BufferReader): VerificationKeyAsFields {
    const reader = BufferReader.asReader(buffer);
    return new VerificationKeyAsFields(reader.readVector(Fr), reader.readObject(Fr));
  }

  /**
   * Builds a fake verification key that should be accepted by circuits.
   * @returns A fake verification key.
   */
  static makeFake(size: number, seed = 1): VerificationKeyAsFields {
    return new VerificationKeyAsFields(makeTuple(size, Fr.random, seed), Fr.random());
  }

  static makeFakeHonk(seed = 1): VerificationKeyAsFields {
    return new VerificationKeyAsFields(makeTuple(ULTRA_HONK_VK_LENGTH_IN_FIELDS, Fr.random, seed), Fr.random());
  }

  static makeFakeRollupHonk(seed = 1): VerificationKeyAsFields {
    return new VerificationKeyAsFields(
      makeTuple(ULTRA_HONK_VK_LENGTH_IN_FIELDS, i => new Fr(i), seed),
      new Fr(seed + 1),
    );
  }

  /**
   * Builds an 'empty' verification key
   * @returns An 'empty' verification key
   */
  static makeEmpty(size: number): VerificationKeyAsFields {
    return new VerificationKeyAsFields(makeTuple(size, Fr.zero), Fr.zero());
  }
}

export class VerificationKey {
  constructor(
    /**
     * For Plonk, this is equivalent to the proving system used to prove and verify.
     */
    public circuitType: CircuitType,
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
    public commitments: Record<string, G1AffineElement>,
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
      this.circuitType,
      this.circuitSize,
      this.numPublicInputs,
      new CommitmentMap(this.commitments),
      this.containsRecursiveProof,
      serializeToBuffer(this.recursiveProofPublicInputIndices.length, this.recursiveProofPublicInputIndices),
    );
  }

  /**
   * Deserializes class from a buffer.
   * @returns A VerificationKey instance.
   */
  static fromBuffer(buffer: Buffer | BufferReader): VerificationKey {
    const reader = BufferReader.asReader(buffer);
    return new VerificationKey(
      reader.readNumber(),
      reader.readNumber(),
      reader.readNumber(),
      reader.readObject(CommitmentMap).record,
      reader.readBoolean(),
      reader.readNumberVector(),
    );
  }

  /**
   * Builds a fake Rollup Honk verification key that should be accepted by circuits.
   * @returns A fake verification key.
   */
  static makeRollupFake(): VerificationKey {
    return new VerificationKey(
      CircuitType.ULTRA, // This is entirely arbitrary
      2048,
      116,
      {}, // Empty set of commitments
      false,
      times(16, i => i),
    );
  }

  /**
   * Builds a fake verification key that should be accepted by circuits.
   * @returns A fake verification key.
   */
  static makeFake(): VerificationKey {
    return new VerificationKey(
      CircuitType.ULTRA, // This is entirely arbitrary
      2048,
      116,
      {}, // Empty set of commitments
      false,
      times(16, i => i),
    );
  }
}

export class VerificationKeyData {
  constructor(
    public readonly keyAsFields: VerificationKeyAsFields,
    public readonly keyAsBytes: Buffer,
  ) {}

  public get numPublicInputs() {
    return this.keyAsFields.numPublicInputs;
  }

  public get circuitSize() {
    return this.keyAsFields.circuitSize;
  }

  public get isRecursive() {
    return this.keyAsFields.isRecursive;
  }

  static empty() {
    return new VerificationKeyData(VerificationKeyAsFields.makeEmpty(0), Buffer.alloc(0));
  }

  static makeFakeHonk(): VerificationKeyData {
    return new VerificationKeyData(VerificationKeyAsFields.makeFakeHonk(), VerificationKey.makeFake().toBuffer());
  }

  static makeFakeRollupHonk(): VerificationKeyData {
    return new VerificationKeyData(
      VerificationKeyAsFields.makeFakeRollupHonk(),
      VerificationKey.makeRollupFake().toBuffer(),
    );
  }

  static makeFake(len = ULTRA_HONK_VK_LENGTH_IN_FIELDS): VerificationKeyData {
    return new VerificationKeyData(VerificationKeyAsFields.makeFake(len), VerificationKey.makeFake().toBuffer());
  }

  /**
   * Serialize as a buffer.
   * @returns The buffer.
   */
  toBuffer() {
    return serializeToBuffer(this.keyAsFields, this.keyAsBytes.length, this.keyAsBytes);
  }

  toString() {
    return bufferToHex(this.toBuffer());
  }

  static fromBuffer(buffer: Buffer | BufferReader): VerificationKeyData {
    const reader = BufferReader.asReader(buffer);
    const verificationKeyAsFields = reader.readObject(VerificationKeyAsFields);
    const length = reader.readNumber();
    const bytes = reader.readBytes(length);
    return new VerificationKeyData(verificationKeyAsFields, bytes);
  }

  static fromString(str: string): VerificationKeyData {
    return VerificationKeyData.fromBuffer(hexToBuffer(str));
  }

  public clone() {
    return VerificationKeyData.fromBuffer(this.toBuffer());
  }

  /** Returns a hex representation for JSON serialization. */
  toJSON() {
    return this.toBuffer();
  }

  /** Creates an instance from a hex string. */
  static get schema() {
    return bufferSchemaFor(VerificationKeyData);
  }
}
