import { toBigIntBE, toBufferBE } from '../bigint-buffer/index.js';
import { keccak256String } from '../crypto/index.js';
import { AztecAddress, BufferReader, EthAddress } from '../index.js';
import { Secp256k1Fq } from './fq.js';

/**
 * Represents an Ethereum public key (a point on the secp256k1 curve) as a 32-byte buffer
 * and provides various utility methods for converting between different representations,
 * generating random public keys, validating checksums, and comparing public keys.
 * EthPublicKey can be instantiated using a buffer or string, and can be serialized/deserialized
 * from a buffer or BufferReader.
 */
export class EthPublicKey {
  static SIZE_IN_BYTES = 64;
  static ZERO = new EthPublicKey(Buffer.alloc(EthPublicKey.SIZE_IN_BYTES));

  constructor(
    /**
     * A buffer containing the x and y coordinates of the secp256k1 curve point.
     */
    public readonly buffer: Buffer,
  ) {
    if (buffer.length !== EthPublicKey.SIZE_IN_BYTES) {
      throw new Error(`Expect EthPublicKey size to be ${EthPublicKey.SIZE_IN_BYTES}. Got ${buffer.length}.`);
    }

    const coordinateX = toBigIntBE(buffer.subarray(0, 32));
    if (coordinateX > Secp256k1Fq.MAX_VALUE) {
      throw new Error(`Coordinate x out of range: ${coordinateX}.`);
    }
    const coordinateY = toBigIntBE(buffer.subarray(32, 64));
    if (coordinateY > Secp256k1Fq.MAX_VALUE) {
      throw new Error(`Coordinate y out of range: ${coordinateY}.`);
    }
  }

  /**
   * Create a random EthPublicKey instance with 20 random bytes.
   * This method generates a new Ethereum public key with a randomly generated set of 20 bytes.
   *
   * @returns A randomly generated EthPublicKey instance.
   *
   * Warning: This will not generate a real random point on the secp256k1 curve, it must only
   * be used for generating test placeholder public keys.
   */
  public static random() {
    const coordinateX = toBufferBE(Secp256k1Fq.random().value, Secp256k1Fq.SIZE_IN_BYTES);
    const coordinateY = toBufferBE(Secp256k1Fq.random().value, Secp256k1Fq.SIZE_IN_BYTES);
    return new EthPublicKey(Buffer.concat([coordinateX, coordinateY]));
  }

  /**
   * Determines if the given string represents a valid Ethereum public key.
   * A valid public key should meet the following criteria:
   * 1. Contains exactly 128 hex characters (excluding an optional '0x' prefix).
   * 2. Is either all lowercase or all uppercase.
   *
   * @param publicKey - The string to be checked for validity as an Ethereum public key.
   * @returns True if the input string represents a valid Ethereum public key, false otherwise.
   *
   * Warning: We do not check if the given string is a point on the secp256k1 curve.
   */
  public static isPublicKey(publicKey: string) {
    return !(/^(0x|0X)?[0-9a-f]{128}$/.test(publicKey) || /^(0x|0X)?[0-9A-F]{128}$/.test(publicKey));
  }

  /**
   * Checks if the EthPublicKey instance represents a zero public key.
   * A zero public key consists of 64 bytes filled with zeros and is considered an invalid public key.
   *
   * @returns A boolean indicating whether the EthPublicKey instance is a zero public key or not.
   */
  public isZero() {
    return this.equals(EthPublicKey.ZERO);
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer to read from.
   * @returns The EthPublicKey.
   */
  static fromBuffer(buffer: Buffer | BufferReader): EthPublicKey {
    const reader = BufferReader.asReader(buffer);
    return new EthPublicKey(reader.readBuffer());
  }

  /**
   * Creates an EthPublicKey instance from a an Ethereum public key string.
   * The input 'publicKey' can be either in uppercase or lowercase, and it can be prefixed with '0x'.
   * Throws an error if the input is not a valid Ethereum public key.
   *
   * @param publicKey - The string representing the Ethereum public key.
   * @returns An EthPublicKey instance.
   *
   * Warning: We do not check if the given string is a point on the secp256k1 curve.
   */
  public static fromString(publicKey: string) {
    if (!EthPublicKey.isPublicKey(publicKey)) {
      throw new Error(`Invalid public key string: ${publicKey}`);
    }
    return new EthPublicKey(Buffer.from(publicKey.replace(/^0x/i, ''), 'hex'));
  }

  /**
   * Returns the internal Buffer representation of the Ethereum public key.
   * This method is useful when working with raw binary data or when
   * integrating with other modules that require a Buffer as input.
   *
   * @returns A Buffer instance containing the 64-byte Ethereum public key.
   */
  public toBuffer() {
    return this.buffer;
  }

  /**
   * Converts the Ethereum public key to a hex-encoded string.
   * The resulting string is prefixed with '0x' and has exactly 128 hex characters.
   * This method can be used to represent the EthPublicKey instance in the widely used hexadecimal format.
   *
   * @returns A hex-encoded string representation of the Ethereum address.
   */
  public toString() {
    return '0x' + this.buffer.toString('hex');
  }

  /**
   * Checks whether the given EthPublicKey instance is equal to the current instance.
   * Equality is determined by comparing the underlying byte buffers of both instances.
   *
   * @param rhs - The EthPublicKey instance to compare with the current instance.
   * @returns A boolean value indicating whether the two instances are equal (true) or not (false).
   */
  public equals(rhs: EthPublicKey) {
    return this.buffer.equals(rhs.toBuffer());
  }

  /**
   * Gets the x-coordinate (first 32 bytes in the buffer) of an Ethereum public key.
   * @returns A Secp256k1Fq instance containing the x-coordinate of the public key.
   */
  x() {
    return new Secp256k1Fq(toBigIntBE(this.buffer.slice(0, 32)));
  }

  /**
   * Gets the x-coordinate (first 32 bytes in the buffer) of an Ethereum public key.
   * @returns A hex-encoded string representation of x-coordinate of the public key.
   */
  xToString() {
    return this.x().toString();
  }

  /**
   * Gets the y-coordinate of an Ethereum public key as a String.
   * @returns A Secp256k1Fq instance containing the y-coordinate of the public key.
   */
  y() {
    return new Secp256k1Fq(toBigIntBE(this.buffer.slice(32, 64)));
  }

  /**
   * Gets the y-coordinate of an Ethereum public key as a String.
   * @returns A hex-encoded string representation of y-coordinate of the public key.
   */
  yToString() {
    return this.y().toString();
  }

  /**
   * Converts an Ethereum public key to a 20-byte Ethereum address.
   * @returns A 20-byte ethereum address.
   */
  toAddress() {
    const publicKeyHex = this.buffer.toString('hex');
    const publicKeyHash = keccak256String(publicKeyHex).slice(0, 20);
    return EthAddress.fromString(publicKeyHash);
  }

  /**
   * Converts an Ethereum public key to a 20-byte Aztec address.
   * @returns A 20-byte Aztec address.
   *
   * Note: This is a temporary arrangement until we start using EthAddress everywhere.
   */
  toAztecAddress() {
    const publicKeyHex = this.buffer.toString('hex');
    const publicKeyHash = keccak256String(publicKeyHex).slice(0, 20);
    return AztecAddress.fromString(publicKeyHash);
  }
}
