import { keccak256String, randomBytes } from '../crypto/index.js';
import { BufferReader, EthAddress } from '../index.js';

/**
 * Represents an Ethereum public key (a point on the secp256k1 curve) as a 32-byte buffer
 * and provides various utility methods for converting between different representations,
 * generating random public keys, validating checksums, and comparing public keys.
 * EthPublicKey can be instantiated using a buffer or string, and can be serialized/deserialized
 * from a buffer or BufferReader.
 */
export class EthPublicKey {
  /**
   * The size of an Ethereum public key in bytes (x-coord and y-coord are 32 bytes each).
   */
  public static SIZE_IN_BYTES = 64;

  /**
   * Represents a zero Ethereum public key with 64 bytes filled with zeros.
   * Warning: This is not a real public key.
   */
  public static ZERO = new EthPublicKey(Buffer.alloc(EthPublicKey.SIZE_IN_BYTES));

  constructor(private buffer: Buffer) {
    if (buffer.length !== EthPublicKey.SIZE_IN_BYTES) {
      throw new Error(`Expect EthPublicKey size to be ${EthPublicKey.SIZE_IN_BYTES}. Got ${buffer.length}.`);
    }
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
   * Create a random EthPublicKey instance with 20 random bytes.
   * This method generates a new Ethereum public key with a randomly generated set of 20 bytes.
   *
   * @returns A randomly generated EthPublicKey instance.
   *
   * Warning: This will not generate a real random point on the secp256k1 curve, it must only
   * be used for generating test placeholder public keys.
   */
  public static random() {
    return new EthPublicKey(randomBytes(32));
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
   * Gets the x-coordinate (first 32 bytes in the buffer) of an Ethereum public key.
   * @returns A buffer containing the 32-byte x-coordinate of the public key.
   */
  x() {
    return this.buffer.slice(0, 32);
  }

  /**
   * Gets the x-coordinate (first 32 bytes in the buffer) of an Ethereum public key.
   * @returns A hex-encoded string representation of x-coordinate of the public key.
   */
  xToString() {
    return '0x' + this.buffer.slice(0, 32).toString('hex');
  }

  /**
   * Gets the y-coordinate of an Ethereum public key as a String.
   * @returns A buffer containing the 32-byte y-coordinate of the public key.
   */
  y() {
    return this.buffer.slice(32);
  }

  /**
   * Gets the y-coordinate of an Ethereum public key as a String.
   * @returns A hex-encoded string representation of y-coordinate of the public key.
   */
  yToString() {
    return '0x' + this.buffer.slice(32).toString('hex');
  }

  /**
   * Converts an Ethereum public key to a 20-byte Ethereum address.
   * @returns A 20-byte ethereum address.
   *
   * TODO: Check this with Leila/Santiago.
   */
  toEthAddress() {
    const publicKeyHex = this.buffer.toString('hex');
    const publicKeyHash = keccak256String(publicKeyHex).slice(0, 20);
    return EthAddress.fromString(publicKeyHash);
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
}
