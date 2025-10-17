import { toBufferBE } from '../bigint-buffer/index.js';
import { Fr } from '../fields/fields.js';
import type { Tuple } from './types.js';

/**
 * Convert a boolean value to its corresponding byte representation in a Buffer of size 1.
 * The function takes a boolean value and writes it into a new buffer as either 1 (true) or 0 (false).
 * This method is useful for converting a boolean value into a binary format that can be stored or transmitted easily.
 *
 * @param b - The boolean value to be converted.
 * @returns A Buffer containing the byte representation of the input boolean value.
 */
export function boolToByte(b: boolean) {
  const buf = Buffer.alloc(1);
  buf.writeUInt8(b ? 1 : 0);
  return buf;
}

/**
 * @param n - The input number to be converted to a big-endian unsigned 16-bit integer Buffer.
 * @param bufferSize - Optional, the size of the output Buffer (default is 2).
 * @returns A Buffer containing the big-endian unsigned 16-bit integer representation of the input number.
 */
export function numToUInt16BE(n: number, bufferSize = 2) {
  const buf = Buffer.alloc(bufferSize);
  buf.writeUInt16BE(n, bufferSize - 2);
  return buf;
}

/**
 * Convert a number into a 4-byte little-endian unsigned integer buffer.
 * The input number is serialized as an unsigned 32-bit integer in little-endian byte order,
 * and returned as a Buffer of specified size (defaults to 4).
 * If the provided bufferSize is greater than 4, the additional bytes will be padded with zeros.
 *
 * @param n - The number to be converted into a little-endian unsigned integer buffer.
 * @param bufferSize - Optional, the size of the output buffer (default value is 4).
 * @returns A Buffer containing the serialized little-endian unsigned integer representation of the input number.
 */
export function numToUInt32LE(n: number, bufferSize = 4) {
  const buf = Buffer.alloc(bufferSize);
  buf.writeUInt32LE(n, bufferSize - 4);
  return buf;
}

/**
 * Convert a number to a big-endian unsigned 32-bit integer Buffer.
 * This function takes a number and an optional buffer size as input and creates a Buffer with the specified size (defaults to 4) containing the big-endian representation of the input number as an unsigned 32-bit integer. Note that the bufferSize should be greater than or equal to 4, otherwise the output Buffer might truncate the serialized value.
 *
 * @param n - The input number to be converted to a big-endian unsigned 32-bit integer Buffer.
 * @param bufferSize - Optional, the size of the output Buffer (default is 4).
 * @returns A Buffer containing the big-endian unsigned 32-bit integer representation of the input number.
 */
export function numToUInt32BE(n: number, bufferSize = 4) {
  const buf = Buffer.alloc(bufferSize);
  buf.writeUInt32BE(n, bufferSize - 4);
  return buf;
}

/**
 * Convert a bigint to a big-endian unsigned 64-bit integer Buffer.
 *
 * @param n - The bigint to be converted to a big-endian unsigned 64-bit integer Buffer.
 * @param bufferSize - Optional, the size of the output Buffer (default is 8).
 * @returns A Buffer containing the big-endian unsigned 64-bit integer representation of the input number.
 */
export function bigintToUInt64BE(n: bigint, bufferSize = 8) {
  const buf = Buffer.alloc(bufferSize);
  buf.writeBigUInt64BE(n, bufferSize - 8);
  return buf;
}

/**
 * Convert a bigint to a big-endian unsigned 128-bit integer Buffer.
 *
 * @param n - The bigint to be converted to a big-endian unsigned 128-bit integer Buffer.
 * @param bufferSize - Optional, the size of the output Buffer (default is 16).
 * @returns A Buffer containing the big-endian unsigned 128-bit integer representation of the input number.
 */
export function bigintToUInt128BE(n: bigint, bufferSize = 16) {
  return toBufferBE(n, bufferSize);
}

/**
 * Serialize a number into a big-endian signed 32-bit integer Buffer with the specified buffer size.
 * This function converts the input number into its binary representation and stores it in a Buffer
 * with the provided buffer size. By default, the buffer size is set to 4 bytes which represents a 32-bit integer.
 * The function will use the last 4 bytes of the buffer to store the serialized number. If the input number
 * is outside the range of a 32-bit signed integer, the resulting serialization may be incorrect due to truncation.
 *
 * @param n - The number to be serialized as a signed 32-bit integer.
 * @param bufferSize - Optional, the size of the output Buffer (default is 4 bytes).
 * @returns A Buffer containing the serialized big-endian signed 32-bit integer.
 */
export function numToInt32BE(n: number, bufferSize = 4) {
  const buf = Buffer.alloc(bufferSize);
  buf.writeInt32BE(n, bufferSize - 4);
  return buf;
}

/**
 * Convert a number to an 8-bit unsigned integer and return it as a Buffer of length 1.
 * The input number is written as an 8-bit unsigned integer into the buffer. This function
 * is useful for converting small numeric values to a standardized binary format that can be
 * easily stored or transmitted.
 *
 * @param n - The number to be converted to an 8-bit unsigned integer.
 * @returns A Buffer containing the 8-bit unsigned integer representation of the input number.
 */
export function numToUInt8(n: number) {
  const bufferSize = 1;
  const buf = Buffer.alloc(bufferSize);
  buf.writeUInt8(n, 0);
  return buf;
}

/**
 * Adds a 4-byte byte-length prefix to a buffer.
 * @param buf - The input Buffer to be prefixed
 * @returns A Buffer with 4-byte byte-length prefix.
 */
export function prefixBufferWithLength(buf: Buffer) {
  const lengthBuf = Buffer.alloc(4);
  lengthBuf.writeUInt32BE(buf.length, 0);
  return Buffer.concat([lengthBuf, buf]);
}

/**
 * Parse a buffer as a big integer.
 */
export function toBigInt(buf: Buffer): bigint {
  const hex = buf.toString('hex');
  if (hex.length === 0) {
    return BigInt(0);
  }
  return BigInt(`0x${hex}`);
}

/**
 * Stores 256 bits of information across two field elements.
 *
 * Since BN254 field elements can hold ~254 bits but we often need to represent full 256-bit
 * values (like SHA-256 hashes), this function splits a 32-byte buffer into two 16-byte chunks,
 * each padded to 32 bytes, creating two field elements that together preserve all 256 bits.
 *
 * @param buf - 32 bytes of data to split. Must be exactly 32 bytes.
 * @returns A tuple of two field elements [Fr, Fr] containing the split data.
 *
 * @throws {Error} If the buffer is not exactly 32 bytes.
 *
 * @example
 * ```typescript
 * import { Fr } from '@aztec/foundation/fields';
 * import { to2Fields, from2Fields } from '@aztec/foundation/serialize';
 *
 * // Split a SHA-256 hash into two fields
 * const hash = Buffer.alloc(32);
 * // ... fill with hash data ...
 * const [field1, field2] = to2Fields(hash);
 *
 * // Reconstruct the original buffer
 * const reconstructed = from2Fields(field1, field2);
 * // hash.equals(reconstructed) === true
 * ```
 *
 * @remarks
 * - Each field element receives 16 bytes of data, padded to 32 bytes
 * - The first field contains bytes [0-15], the second contains bytes [16-31]
 * - Padding is added at the beginning of each field (high-order bytes)
 * - This ensures both fields are valid (< field modulus)
 * - Commonly used for representing SHA-256 hashes in circuits
 * - The reverse operation is {@link from2Fields}
 */
export function to2Fields(buf: Buffer): [Fr, Fr] {
  if (buf.length !== 32) {
    throw new Error('Buffer must be 32 bytes');
  }

  // Split the hash into two fields, a high and a low
  const buf1 = Buffer.concat([Buffer.alloc(16), buf.subarray(0, 16)]);
  const buf2 = Buffer.concat([Buffer.alloc(16), buf.subarray(16, 32)]);

  return [Fr.fromBuffer(buf1), Fr.fromBuffer(buf2)];
}

/**
 * Reconstructs 256 bits of data from two field elements.
 *
 * This is the inverse operation of {@link to2Fields}, combining two field elements back into
 * a single 32-byte buffer. The function extracts the lower 16 bytes from each field and
 * concatenates them.
 *
 * @param field1 - First field element containing the first 16 bytes (padded to 32).
 * @param field2 - Second field element containing the last 16 bytes (padded to 32).
 * @returns A 32-byte buffer reconstructing the original data.
 *
 * @example
 * ```typescript
 * import { Fr } from '@aztec/foundation/fields';
 * import { to2Fields, from2Fields } from '@aztec/foundation/serialize';
 *
 * // Original data
 * const original = Buffer.from('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef', 'hex');
 *
 * // Split and reconstruct
 * const [field1, field2] = to2Fields(original);
 * const reconstructed = from2Fields(field1, field2);
 *
 * // Verify equality
 * console.log(original.equals(reconstructed)); // true
 * ```
 *
 * @remarks
 * - Removes the 16-byte padding from each field element
 * - Extracts bytes [16-31] from each field (the actual data)
 * - Concatenates the two 16-byte chunks into a 32-byte buffer
 * - Essential for reading SHA-256 hashes from circuit outputs
 * - The inverse operation of {@link to2Fields}
 */
export function from2Fields(field1: Fr, field2: Fr): Buffer {
  // Convert the field elements back to buffers
  const buf1 = field1.toBuffer();
  const buf2 = field2.toBuffer();

  // Remove the padding (first 16 bytes) from each buffer
  const originalPart1 = buf1.subarray(Fr.SIZE_IN_BYTES / 2, Fr.SIZE_IN_BYTES);
  const originalPart2 = buf2.subarray(Fr.SIZE_IN_BYTES / 2, Fr.SIZE_IN_BYTES);

  // Concatenate the two parts to form the original buffer
  return Buffer.concat([originalPart1, originalPart2]);
}

/**
 * Truncates a 32-byte hash to 31 bytes and pads it back to 32 bytes.
 *
 * This function is essential for using SHA-256 hashes as field elements in the BN254 field.
 * Since the BN254 field modulus is slightly less than 2^254, a full 256-bit value might
 * exceed the field modulus. By truncating to 31 bytes (248 bits), we ensure the value
 * always fits within the field.
 *
 * The truncation matches the behavior of Solidity's sha256ToField() and Noir's truncation,
 * ensuring cross-platform compatibility.
 *
 * @param buf - A 32-byte buffer to truncate. Must be exactly 32 bytes.
 * @returns A 32-byte buffer where the first byte is 0x00 and bytes [1-31] contain
 *          the first 31 bytes of the input.
 *
 * @throws {Error} If the input buffer is not exactly 32 bytes.
 *
 * @example
 * ```typescript
 * import { sha256 } from '@aztec/foundation/crypto';
 * import { truncateAndPad } from '@aztec/foundation/serialize';
 * import { Fr } from '@aztec/foundation/fields';
 *
 * // Hash some data
 * const data = Buffer.from('Hello, Aztec!');
 * const hash = sha256(data);
 *
 * // Truncate and convert to field
 * const truncated = truncateAndPad(hash);
 * const field = Fr.fromBuffer(truncated);
 * // field is guaranteed to be < Fr.MODULUS
 * ```
 *
 * @remarks
 * - Always truncates to 31 bytes, regardless of the actual value
 * - The first byte (most significant) is always set to 0x00
 * - Bytes [1-31] contain the original bytes [0-30]
 * - The last byte of the input is discarded
 * - Matches Solidity's sha256ToField() implementation for compatibility
 * - Reduces security from 256 bits to 248 bits (still cryptographically secure)
 * - Essential for using SHA-256 in Aztec circuits
 */
export function truncateAndPad(buf: Buffer): Buffer {
  // Note that we always truncate here, to match solidity's sha256ToField()
  if (buf.length !== 32) {
    throw new Error('Buffer to truncate must be 32 bytes');
  }
  return Buffer.concat([Buffer.alloc(1), buf.subarray(0, 31)]);
}

export function fromFieldsTuple(fields: Tuple<Fr, 2>): Buffer {
  return from2Fields(fields[0], fields[1]);
}

export function toHumanReadable(buf: Buffer, maxLen?: number): string {
  const result = buf.every(byte => byte >= 32 && byte <= 126) ? buf.toString('ascii') : `0x${buf.toString('hex')}`;
  if (maxLen && result.length > maxLen) {
    return result.slice(0, maxLen) + '...';
  }
  return result;
}
