import { ULTRA_VK_LENGTH_IN_FIELDS } from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { Fr } from '@aztec/foundation/curves/bn254';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { hashVK } from '../hash/index.js';

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
    const keyAsFields = VerificationKeyAsFields.makeFakeHonk();
    return new VerificationKeyData(keyAsFields, keyAsFields.toBuffer());
  }

  static makeFakeRollupHonk(): VerificationKeyData {
    const keyAsFields = VerificationKeyAsFields.makeFakeRollupHonk();
    return new VerificationKeyData(keyAsFields, keyAsFields.toBuffer());
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
