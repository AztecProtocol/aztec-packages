/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */
import { inspect } from 'util';

import { Fr, Point, fromBuffer } from '../fields/index.js';
import { hexSchemaFor } from '../schemas/utils.js';
import { type BufferReader, FieldReader } from '../serialize/index.js';
import { TypeRegistry } from '../serialize/type_registry.js';
import { hexToBuffer } from '../string/index.js';

/** Branding to ensure fields are not interchangeable types. */
export interface AztecAddress {
  /** Brand. */
  _branding: 'AztecAddress';
}
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

  static zero(): AztecAddress {
    return AztecAddress.ZERO;
  }

  static fromField(fr: Fr) {
    return new AztecAddress(fr);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    return new AztecAddress(fromBuffer(buffer, Fr));
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new AztecAddress(reader.readField());
  }

  static fromBigInt(value: bigint) {
    return new AztecAddress(new Fr(value));
  }

  static fromNumber(value: number) {
    return new AztecAddress(new Fr(value));
  }

  static fromString(buf: string) {
    return new AztecAddress(hexToBuffer(buf));
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

  toBuffer() {
    return this.xCoord.toBuffer();
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

  static get schema() {
    return hexSchemaFor(AztecAddress, AztecAddress.isAddress);
  }
}

// For deserializing JSON.
TypeRegistry.register('AztecAddress', AztecAddress);
