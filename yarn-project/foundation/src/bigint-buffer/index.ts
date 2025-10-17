/**
 * Converts a little-endian buffer into a BigInt.
 *
 * In little-endian format, the least significant byte (LSB) is stored at the lowest memory address.
 * This function reverses the byte order before converting to BigInt for correct interpretation.
 *
 * @param buf - The little-endian buffer to convert. Can be any length.
 * @returns A BigInt representing the numeric value encoded in the buffer. Returns 0n for empty buffers.
 *
 * @example
 * ```typescript
 * // Convert a 4-byte little-endian buffer representing the number 305419896 (0x12345678)
 * const buf = Buffer.from([0x78, 0x56, 0x34, 0x12]);
 * const result = toBigIntLE(buf);
 * // result === 305419896n
 * ```
 *
 * @remarks
 * - Empty buffers return BigInt(0)
 * - The function creates a copy of the buffer before reversing to avoid mutating the input
 * - Useful for reading integers from binary formats that use little-endian encoding
 */
export function toBigIntLE(buf: Buffer): bigint {
  const reversed = Buffer.from(buf);
  reversed.reverse();
  const hex = reversed.toString('hex');
  if (hex.length === 0) {
    return BigInt(0);
  }
  return BigInt(`0x${hex}`);
}

/**
 * Converts a big-endian buffer into a BigInt.
 *
 * In big-endian format, the most significant byte (MSB) is stored at the lowest memory address.
 * This is the natural byte order for hexadecimal representation and is commonly used in
 * network protocols and cryptographic operations.
 *
 * @param buf - The big-endian buffer to convert. Can be any length.
 * @returns A BigInt representing the numeric value encoded in the buffer. Returns 0n for empty buffers.
 *
 * @example
 * ```typescript
 * // Convert a 4-byte big-endian buffer representing the number 305419896 (0x12345678)
 * const buf = Buffer.from([0x12, 0x34, 0x56, 0x78]);
 * const result = toBigIntBE(buf);
 * // result === 305419896n
 * ```
 *
 * @remarks
 * - Empty buffers return BigInt(0)
 * - This is the most common endianness for human-readable hex strings
 * - More efficient than toBigIntLE as it doesn't require byte reversal
 */
export function toBigIntBE(buf: Buffer): bigint {
  const hex = buf.toString('hex');
  if (hex.length === 0) {
    return BigInt(0);
  }
  return BigInt(`0x${hex}`);
}

/**
 * Converts a BigInt to a little-endian buffer with a fixed width.
 *
 * The resulting buffer stores the least significant byte (LSB) at the lowest memory address.
 * If the number requires fewer bytes than `width`, it is padded with zeros on the right
 * (high-order bytes). If the number requires more bytes, it is truncated.
 *
 * @param num - The BigInt to convert. Must be non-negative.
 * @param width - The exact number of bytes for the resulting buffer.
 * @returns A little-endian buffer representation of the number.
 *
 * @throws {Error} If `num` is negative.
 *
 * @example
 * ```typescript
 * // Convert 305419896n (0x12345678) to a 4-byte little-endian buffer
 * const result = toBufferLE(305419896n, 4);
 * // result: Buffer<78 56 34 12>
 *
 * // With padding (number smaller than width)
 * const padded = toBufferLE(255n, 4);
 * // padded: Buffer<ff 00 00 00>
 *
 * // Truncation (number larger than width allows)
 * const truncated = toBufferLE(0x123456789n, 4);
 * // truncated: Buffer<89 67 45 23> (high byte 0x1 is truncated)
 * ```
 *
 * @remarks
 * - Only accepts non-negative BigInts
 * - Padding occurs at high-order bytes (end of buffer)
 * - Truncation occurs at high-order bytes if number exceeds width
 * - Commonly used in little-endian architectures and some binary protocols
 */
export function toBufferLE(num: bigint, width: number): Buffer {
  if (num < BigInt(0)) {
    throw new Error(`Cannot convert negative bigint ${num.toString()} to buffer with toBufferLE.`);
  }
  const hex = num.toString(16);
  const buffer = Buffer.from(hex.padStart(width * 2, '0').slice(0, width * 2), 'hex');
  buffer.reverse();
  return buffer;
}

/**
 * Converts a BigInt to a big-endian buffer with a fixed width.
 *
 * The resulting buffer stores the most significant byte (MSB) at the lowest memory address.
 * If the number requires fewer bytes than `width`, it is padded with zeros on the left
 * (high-order bytes). The function validates that the number fits within the specified width.
 *
 * @param num - The BigInt to convert. Must be non-negative.
 * @param width - The exact number of bytes for the resulting buffer.
 * @returns A big-endian buffer representation of the number.
 *
 * @throws {Error} If `num` is negative.
 * @throws {Error} If the number requires more bytes than `width` allows.
 *
 * @example
 * ```typescript
 * // Convert 305419896n (0x12345678) to a 4-byte big-endian buffer
 * const result = toBufferBE(305419896n, 4);
 * // result: Buffer<12 34 56 78>
 *
 * // With padding (number smaller than width)
 * const padded = toBufferBE(255n, 4);
 * // padded: Buffer<00 00 00 ff>
 *
 * // Error: number too large for width
 * try {
 *   toBufferBE(0x123456789n, 4); // Requires 5 bytes but width is 4
 * } catch (e) {
 *   console.error(e.message); // "Number 123456789 does not fit in 4"
 * }
 * ```
 *
 * @remarks
 * - Only accepts non-negative BigInts
 * - Padding occurs at high-order bytes (beginning of buffer)
 * - Strictly validates that the number fits within the specified width (no silent truncation)
 * - This is the standard format for most cryptographic operations and network protocols
 * - More commonly used than little-endian in the Aztec Protocol
 */
export function toBufferBE(num: bigint, width: number): Buffer {
  if (num < BigInt(0)) {
    throw new Error(`Cannot convert negative bigint ${num.toString()} to buffer with toBufferBE.`);
  }
  const hex = num.toString(16);
  const buffer = Buffer.from(hex.padStart(width * 2, '0').slice(0, width * 2), 'hex');
  if (buffer.length > width) {
    throw new Error(`Number ${num.toString(16)} does not fit in ${width}`);
  }
  return buffer;
}

/**
 * Converts a BigInt to its hexadecimal string representation with optional padding.
 *
 * The output is always an even-length string (pairs of hex digits) and is prefixed with "0x".
 * Optionally pads the string to represent a full 32-byte (64 hex character) value.
 *
 * @param num - The BigInt to convert. Can be any non-negative value.
 * @param padTo32 - If true, pads the string to 64 hex characters (32 bytes). Defaults to false.
 * @returns A 0x-prefixed hexadecimal string with even length.
 *
 * @example
 * ```typescript
 * // Basic conversion
 * toHex(255n);
 * // Returns: "0xff"
 *
 * // Odd-length hex gets padded to even length
 * toHex(15n);
 * // Returns: "0x0f"
 *
 * // Pad to 32 bytes
 * toHex(255n, true);
 * // Returns: "0x00000000000000000000000000000000000000000000000000000000000000ff"
 *
 * // Large numbers
 * toHex(0x123456789abcdefn);
 * // Returns: "0x0123456789abcdef"
 * ```
 *
 * @remarks
 * - Always returns lowercase hexadecimal characters
 * - Ensures even-length strings for proper byte alignment
 * - The padTo32 option is useful for field elements and cryptographic operations
 * - Zero values are represented as "0x00" (or padded equivalent if padTo32 is true)
 */
export function toHex(num: bigint, padTo32 = false): `0x${string}` {
  const str = num.toString(16);
  const targetLen = str.length % 2 === 0 ? str.length : str.length + 1;
  const paddedStr = str.padStart(padTo32 ? 64 : targetLen, '0');
  return `0x${paddedStr}`;
}

/**
 * Converts a hexadecimal string to a Buffer.
 *
 * Accepts hex strings with or without the "0x" prefix. The input must be a valid
 * hexadecimal string (containing only 0-9, a-f, A-F characters) with an even length
 * to ensure proper byte alignment.
 *
 * @param value - The hexadecimal string to convert. May be prefixed with "0x" or not.
 * @returns A Buffer containing the decoded bytes.
 *
 * @throws {Error} If the input is not a valid hexadecimal string.
 * @throws {Error} If the input has an odd length (not byte-aligned).
 *
 * @example
 * ```typescript
 * // With 0x prefix
 * const buf1 = fromHex("0x1234");
 * // buf1: Buffer<12 34>
 *
 * // Without prefix
 * const buf2 = fromHex("abcd");
 * // buf2: Buffer<ab cd>
 *
 * // Case insensitive
 * const buf3 = fromHex("0xABCD");
 * // buf3: Buffer<ab cd>
 *
 * // Error: odd length
 * try {
 *   fromHex("0x123");
 * } catch (e) {
 *   console.error(e.message); // "Invalid hex string: 0x123"
 * }
 *
 * // Error: invalid characters
 * try {
 *   fromHex("0xGHIJ");
 * } catch (e) {
 *   console.error(e.message); // "Invalid hex string: 0xGHIJ"
 * }
 * ```
 *
 * @remarks
 * - Accepts both uppercase and lowercase hex characters
 * - The "0x" prefix is optional and automatically stripped if present
 * - Input must have an even number of characters (excluding prefix) to represent complete bytes
 * - Empty strings and strings with only "0x" are considered invalid
 */
export function fromHex(value: string): Buffer {
  const hexRegex = /^(0x)?[0-9a-fA-F]*$/;
  if (!hexRegex.test(value) || value.length % 2 !== 0) {
    throw new Error(`Invalid hex string: ${value}`);
  }
  return Buffer.from(value.replace(/^0x/i, ''), 'hex');
}
