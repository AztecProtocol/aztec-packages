import { NULL_MSG_SENDER_CONTRACT_ADDRESS } from '@aztec/constants';
import { Fr, fromBuffer } from '@aztec/foundation/curves/bn254';
import { Point } from '@aztec/foundation/curves/grumpkin';
import { type ZodFor, bufferSchemaFor, hexSchemaFor } from '@aztec/foundation/schemas';
import { type BufferReader, type BufferSink, FieldReader } from '@aztec/foundation/serialize';
import { hexToBuffer } from '@aztec/foundation/string';

import { inspect } from 'util';
import { z } from 'zod';

/**
 * AztecAddress represents a 32-byte address in the Aztec Protocol. It provides methods to create, manipulate, and
 * compare addresses, as well as conversion to and from strings, buffers, and other formats.
 * Addresses are the x coordinate of a point in the Grumpkin curve, and therefore their maximum is determined by the
 * field modulus. An address with a value that is not the x coordinate of a point in the curve is a called an 'invalid
 * address'. These addresses have a greatly reduced feature set, as they cannot own secrets nor have messages encrypted
 * to them, making them quite useless. We need to be able to represent them however as they can be encountered in the
 * wild.
 */
export class AztecAddress {
  /** Branding for nominal typing. */
  declare private readonly _branding: 'AztecAddress';

  private xCoord: Fr;

  constructor(buffer: Buffer | Fr) {
    if ('length' in buffer && buffer.length !== 32) {
      throw new Error(`Invalid AztecAddress length ${buffer.length}.`);
    }
    this.xCoord = new Fr(buffer);
  }

  [inspect.custom]() {
    return `AztecAddress<${this.toString()}>`;
  }

  static isAddress(str: string) {
    return /^(0x)?[a-fA-F0-9]{64}$/.test(str);
  }

  static SIZE_IN_BYTES = Fr.SIZE_IN_BYTES;

  static ZERO = new AztecAddress(Buffer.alloc(32, 0));

  /** Null msg sender address. Not part of the protocol contracts tree. */
  static NULL_MSG_SENDER = AztecAddress.fromBigIntUnsafe(NULL_MSG_SENDER_CONTRACT_ADDRESS);

  static zero(): AztecAddress {
    return AztecAddress.ZERO;
  }

  /**
   * Builds an `AztecAddress` from a field **without checking it is a valid address** (the x-coordinate of a point on
   * the Grumpkin curve, which is what lets it be encrypted to). Use {@link AztecAddress.isValid} to validate an
   * untrusted one, or {@link AztecAddress.random} for valid test addresses.
   */
  static fromFieldUnsafe(fr: Fr) {
    return new AztecAddress(fr);
  }

  /**
   * Deserializes an `AztecAddress` from a buffer. It does **not** check the value is a valid Grumpkin-curve address
   * (see {@link AztecAddress.isValid}); it is meant for reading addresses from already-validated serialized data. Use
   * {@link AztecAddress.random} for valid test addresses.
   */
  static fromBuffer(buffer: Buffer | BufferReader) {
    return new AztecAddress(fromBuffer(buffer, Fr));
  }

  /**
   * Deserializes an `AztecAddress` from a field reader. It does **not** check the value is a valid Grumpkin-curve
   * address (see {@link AztecAddress.isValid}); it is meant for reading addresses from already-validated serialized
   * data. Use {@link AztecAddress.random} for valid test addresses.
   */
  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new AztecAddress(reader.readField());
  }

  /**
   * Builds an `AztecAddress` from a bigint **without checking it is a valid address** (the x-coordinate of a point on
   * the Grumpkin curve, which is what lets it be encrypted to). Use {@link AztecAddress.isValid} to validate an
   * untrusted one, or {@link AztecAddress.random} for valid test addresses.
   */
  static fromBigIntUnsafe(value: bigint) {
    return new AztecAddress(new Fr(value));
  }

  /**
   * Builds an `AztecAddress` from a number **without checking it is a valid address** (the x-coordinate of a point on
   * the Grumpkin curve, which is what lets it be encrypted to). Use {@link AztecAddress.isValid} to validate an
   * untrusted one, or {@link AztecAddress.random} for valid test addresses.
   */
  static fromNumberUnsafe(value: number) {
    return new AztecAddress(new Fr(value));
  }

  /**
   * Builds an `AztecAddress` from a hex string **without checking it is a valid address** (the x-coordinate of a
   * point on the Grumpkin curve, which is what lets it be encrypted to). Use {@link AztecAddress.isValid} to
   * validate an untrusted one, or {@link AztecAddress.random} for valid test addresses.
   */
  static fromStringUnsafe(buf: string) {
    return new AztecAddress(hexToBuffer(buf));
  }

  /**
   * Creates an AztecAddress from a plain object without Zod validation.
   * This method is optimized for performance and skips validation, making it suitable
   * for deserializing trusted data (e.g., from C++ via MessagePack).
   * Handles buffers, strings, or existing instances.
   * @param obj - Plain object, buffer, string, or AztecAddress instance
   * @returns An AztecAddress instance
   */
  static fromPlainObject(obj: any): AztecAddress {
    if (obj instanceof AztecAddress) {
      return obj;
    }
    if (obj instanceof Buffer || Buffer.isBuffer(obj)) {
      return new AztecAddress(obj);
    }
    return AztecAddress.fromStringUnsafe(obj);
  }

  /**
   * @returns a random valid address (i.e. one that can be encrypted to).
   */
  static async random() {
    // About half of random field elements result in invalid addresses, so we loop until we get a valid one.
    while (true) {
      const candidate = new AztecAddress(Fr.random());
      if (await candidate.isValid()) {
        return candidate;
      }
    }
  }

  get size() {
    return this.xCoord.size;
  }

  equals(other: AztecAddress) {
    return this.xCoord.equals(other.xCoord);
  }

  isZero() {
    return this.xCoord.isZero();
  }

  /**
   * @returns true if the address is valid. Invalid addresses cannot receive encrypted messages.
   */
  async isValid() {
    // An address is a field value (Fr), which for some purposes is assumed to be the x coordinate of a point in the
    // Grumpkin curve (notably in order to encrypt to it). An address that is not the x coordinate of such a point is
    // called an 'invalid' address.
    //
    // For Grumpkin, y^2 = x^3 − 17 . There exist values x ∈ Fr for which no y satisfies this equation. This means that
    // given such an x and t = x^3 − 17, then sqrt(t) does not exist in Fr.
    return (await Point.YFromX(this.xCoord)) !== null;
  }

  /**
   * @returns the Point from which the address is derived. Throws if the address is invalid.
   */
  toAddressPoint(): Promise<Point> {
    return Point.fromXAndSign(this.xCoord, true);
  }

  toBuffer(): Buffer;
  toBuffer(sink: BufferSink): void;
  toBuffer(sink?: BufferSink): Buffer | void {
    if (!sink) {
      return this.xCoord.toBuffer();
    }
    this.xCoord.toBuffer(sink);
  }

  toBigInt() {
    return this.xCoord.toBigInt();
  }

  toField() {
    return this.xCoord;
  }

  toString() {
    return this.xCoord.toString();
  }

  toJSON() {
    return this.toString();
  }

  static get schema(): ZodFor<AztecAddress> {
    return z.union([
      // Serialization from hex string.
      hexSchemaFor(AztecAddress, AztecAddress.isAddress),
      // Serialization from buffer.
      bufferSchemaFor(AztecAddress, buf => buf.length === 32),
    ]);
  }
}
