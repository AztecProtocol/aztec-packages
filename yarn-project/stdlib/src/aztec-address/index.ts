/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */
import { Fr, Point, fromBuffer } from '@aztec/foundation/fields';
import { type ZodFor, hexSchemaFor } from '@aztec/foundation/schemas';
import { type BufferReader, FieldReader, TypeRegistry } from '@aztec/foundation/serialize';
import { hexToBuffer } from '@aztec/foundation/string';

import { inspect } from 'util';

/**
 * Branding interface to ensure AztecAddress fields are not interchangeable with other types.
 * This is a TypeScript pattern to create nominal typing for otherwise structurally identical types.
 */
export interface AztecAddress {
  /** Brand property for type safety. */
  _branding: 'AztecAddress';
}

/**
 * Represents a 32-byte address in the Aztec Protocol.
 *
 * An AztecAddress is fundamentally the x-coordinate of a point on the Grumpkin elliptic curve.
 * This design choice has important implications:
 *
 * - **Valid addresses**: Can be derived to a full point on the curve, enabling encryption and note ownership
 * - **Invalid addresses**: Cannot be derived to a point, severely limiting functionality (no secrets, no encryption)
 *
 * The class provides comprehensive methods for:
 * - Creating addresses from various formats (buffers, strings, fields, numbers)
 * - Validating addresses (checking if they represent valid curve points)
 * - Converting addresses to different representations
 * - Comparing and manipulating addresses
 *
 * @remarks
 * For the Grumpkin curve, y^2 = x^3 - 17. Not all x values in the field Fr have a corresponding y value,
 * which is why some addresses are considered "invalid". About half of random field elements result in
 * invalid addresses.
 *
 * @example
 * ```typescript
 * // Create a random valid address
 * const address = await AztecAddress.random();
 *
 * // Check if an address is valid
 * if (await address.isValid()) {
 *   console.log('Address can receive encrypted messages');
 * }
 *
 * // Create from a hex string
 * const addr = AztecAddress.fromString('0x1234...');
 *
 * // Convert to different formats
 * const hex = address.toString();
 * const buffer = address.toBuffer();
 * const field = address.toField();
 * ```
 *
 * @see {@link https://docs.aztec.network/concepts/accounts | Aztec Accounts Documentation}
 */
export class AztecAddress {
  private xCoord: Fr;

  /**
   * Creates a new AztecAddress from a Buffer or field element.
   *
   * @param buffer - A 32-byte Buffer or Fr field element representing the address
   * @throws Error if the buffer length is not exactly 32 bytes
   *
   * @example
   * ```typescript
   * // From a Buffer
   * const addr = new AztecAddress(Buffer.alloc(32));
   *
   * // From a field element
   * const addr2 = new AztecAddress(Fr.random());
   * ```
   */
  constructor(buffer: Buffer | Fr) {
    if ('length' in buffer && buffer.length !== 32) {
      throw new Error(`Invalid AztecAddress length ${buffer.length}.`);
    }
    this.xCoord = new Fr(buffer);
  }

  [inspect.custom]() {
    return `AztecAddress<${this.toString()}>`;
  }

  /**
   * Validates if a string is a properly formatted address.
   *
   * @param str - The string to validate
   * @returns True if the string is a valid 64-character hex string (with optional 0x prefix)
   *
   * @example
   * ```typescript
   * AztecAddress.isAddress('0x1234...'); // true if 64 hex chars
   * AztecAddress.isAddress('invalid'); // false
   * ```
   */
  static isAddress(str: string) {
    return /^(0x)?[a-fA-F0-9]{64}$/.test(str);
  }

  /** The size of an AztecAddress in bytes (always 32). */
  static SIZE_IN_BYTES = Fr.SIZE_IN_BYTES;

  /** A constant zero address. */
  static ZERO = new AztecAddress(Buffer.alloc(32, 0));

  /**
   * Returns the zero address.
   *
   * @returns A new instance of the zero address
   */
  static zero(): AztecAddress {
    return AztecAddress.ZERO;
  }

  /**
   * Creates an AztecAddress from a field element.
   *
   * @param fr - The field element to convert
   * @returns A new AztecAddress instance
   */
  static fromField(fr: Fr) {
    return new AztecAddress(fr);
  }

  /**
   * Deserializes an AztecAddress from a Buffer or BufferReader.
   *
   * @param buffer - The buffer or reader to deserialize from
   * @returns A new AztecAddress instance
   */
  static fromBuffer(buffer: Buffer | BufferReader) {
    return new AztecAddress(fromBuffer(buffer, Fr));
  }

  /**
   * Deserializes an AztecAddress from an array of field elements.
   *
   * @param fields - Array of field elements or a FieldReader
   * @returns A new AztecAddress instance
   */
  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new AztecAddress(reader.readField());
  }

  /**
   * Creates an AztecAddress from a BigInt value.
   *
   * @param value - The BigInt value to convert
   * @returns A new AztecAddress instance
   */
  static fromBigInt(value: bigint) {
    return new AztecAddress(new Fr(value));
  }

  /**
   * Creates an AztecAddress from a number.
   *
   * @param value - The number to convert
   * @returns A new AztecAddress instance
   */
  static fromNumber(value: number) {
    return new AztecAddress(new Fr(value));
  }

  /**
   * Creates an AztecAddress from a hex string.
   *
   * @param buf - The hex string (with or without 0x prefix)
   * @returns A new AztecAddress instance
   *
   * @example
   * ```typescript
   * const addr = AztecAddress.fromString('0x1234567890abcdef...');
   * ```
   */
  static fromString(buf: string) {
    return new AztecAddress(hexToBuffer(buf));
  }

  /**
   * Generates a random valid address.
   *
   * This method continuously generates random field elements until it finds one that corresponds
   * to a valid point on the Grumpkin curve (i.e., one that can be encrypted to).
   *
   * @returns A promise that resolves to a random valid AztecAddress
   *
   * @remarks
   * About half of random field elements result in invalid addresses, so this method may
   * need to try multiple candidates before finding a valid one.
   *
   * @example
   * ```typescript
   * const validAddress = await AztecAddress.random();
   * console.log(await validAddress.isValid()); // true
   * ```
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

  /**
   * Gets the size of the address in bytes.
   *
   * @returns The size in bytes (always 32)
   */
  get size() {
    return this.xCoord.size;
  }

  /**
   * Checks if this address equals another address.
   *
   * @param other - The address to compare with
   * @returns True if the addresses are equal
   */
  equals(other: AztecAddress) {
    return this.xCoord.equals(other.xCoord);
  }

  /**
   * Checks if this is the zero address.
   *
   * @returns True if the address is zero
   */
  isZero() {
    return this.xCoord.isZero();
  }

  /**
   * Validates whether this address corresponds to a valid point on the Grumpkin curve.
   *
   * An address is valid if its x-coordinate corresponds to a point on the Grumpkin curve.
   * For Grumpkin, y^2 = x^3 - 17. Not all x values have a corresponding y value in the field.
   *
   * @returns A promise that resolves to true if the address is valid
   *
   * @remarks
   * Invalid addresses have severely limited functionality:
   * - Cannot receive encrypted messages
   * - Cannot own secrets or private state
   * - Effectively unusable in most Aztec operations
   *
   * @example
   * ```typescript
   * const addr = AztecAddress.fromNumber(123);
   * if (await addr.isValid()) {
   *   console.log('This address can receive encrypted notes');
   * } else {
   *   console.log('This address is invalid and cannot receive encryption');
   * }
   * ```
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
   * Derives the full elliptic curve point from this address.
   *
   * @returns A promise that resolves to the Point corresponding to this address
   * @throws Error if the address is invalid (does not correspond to a curve point)
   *
   * @remarks
   * This method assumes the y-coordinate has a positive sign. The point is used for
   * cryptographic operations like encryption.
   *
   * @example
   * ```typescript
   * const addr = await AztecAddress.random();
   * const point = await addr.toAddressPoint();
   * // Use point for encryption operations
   * ```
   */
  toAddressPoint(): Promise<Point> {
    return Point.fromXAndSign(this.xCoord, true);
  }

  /**
   * Serializes the address to a 32-byte Buffer.
   *
   * @returns A Buffer representation of the address
   */
  toBuffer() {
    return this.xCoord.toBuffer();
  }

  /**
   * Converts the address to a BigInt.
   *
   * @returns The BigInt representation of the address
   */
  toBigInt() {
    return this.xCoord.toBigInt();
  }

  /**
   * Converts the address to a field element.
   *
   * @returns The Fr field representation of the address
   */
  toField() {
    return this.xCoord;
  }

  /**
   * Converts the address to a hex string representation.
   *
   * @returns A hex string (with 0x prefix) representation of the address
   */
  toString() {
    return this.xCoord.toString();
  }

  /**
   * Converts the address to a JSON-serializable format.
   *
   * @returns The hex string representation for JSON serialization
   */
  toJSON() {
    return this.toString();
  }

  /**
   * Gets the Zod schema for validating AztecAddress instances.
   *
   * @returns A Zod schema that can validate and parse AztecAddress values
   */
  static get schema(): ZodFor<AztecAddress> {
    return hexSchemaFor(AztecAddress, AztecAddress.isAddress);
  }
}

// For deserializing JSON.
TypeRegistry.register('AztecAddress', AztecAddress);
