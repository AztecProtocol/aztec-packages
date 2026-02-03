import { ULTRA_VK_LENGTH_IN_FIELDS } from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { times } from '@aztec/foundation/collection';
import { Fq, Fr } from '@aztec/foundation/curves/bn254';
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

  static fromFrBuffer(vkBytes: Buffer): Promise<VerificationKeyAsFields> {
    const numFields = vkBytes.length / Fr.SIZE_IN_BYTES;
    const reader = BufferReader.asReader(vkBytes);
    const fields = reader.readArray(numFields, Fr);
    return VerificationKeyAsFields.fromKey(fields);
  }

  /**
   * Builds a fake verification key that should be accepted by circuits.
   * @returns A fake verification key.
   */
  static makeFake(size: number, seed = 1): VerificationKeyAsFields {
    return new VerificationKeyAsFields(makeTuple(size, Fr.random, seed), Fr.random());
  }

  static makeFakeHonk(seed = 1): VerificationKeyAsFields {
    return new VerificationKeyAsFields(makeTuple(ULTRA_VK_LENGTH_IN_FIELDS, Fr.random, seed), Fr.random());
  }

  static makeFakeRollupHonk(seed = 1): VerificationKeyAsFields {
    return new VerificationKeyAsFields(
      makeTuple(ULTRA_VK_LENGTH_IN_FIELDS, i => new Fr(i), seed),
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

  /**
   * Builds a fake MegaHonk verification key buffer for testing.
   * Uses a real VK from a compiled contract to ensure proper format.
   *
   * @returns A valid MegaHonk VK buffer (4064 bytes)
   */
  static makeFakeMegaHonk(): Buffer {
    // This is a real MegaFlavor VK from token_contract, base64-encoded
    // Size: 4064 bytes (127 fields × 32 bytes)
    const vk =
      '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';
    return Buffer.from(vk, 'base64');
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

  static makeFake(len = ULTRA_VK_LENGTH_IN_FIELDS): VerificationKeyData {
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

  static async fromFrBuffer(vkBytes: Buffer): Promise<VerificationKeyData> {
    return new VerificationKeyData(await VerificationKeyAsFields.fromFrBuffer(vkBytes), vkBytes);
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
