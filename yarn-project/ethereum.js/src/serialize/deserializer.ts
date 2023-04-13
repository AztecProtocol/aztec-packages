import {
  deserializeArrayFromVector,
  deserializeBigInt,
  deserializeBool,
  deserializeBufferFromVector,
  deserializeInt32,
  deserializeUInt32,
} from './free_funcs.js';

/**
 * Type representing a deserialization function that takes a buffer and an offset as input parameters, 
 * and returns an object containing the deserialized element of type T and the number of bytes consumed.
 */
export type DeserializeFn<T> = (buf: Buffer, offset: number) => { /**
 * The deserialized element from the buffer.
 */
elem: T; /**
 * The number of bytes advanced in the buffer after deserialization.
 */
adv: number };

/**
 * The Deserializer class provides a set of utility methods for efficiently deserializing data from a buffer.
 * It supports various primitive types such as boolean, integers, BigInt, string, and Date, as well as
 * more complex structures like arrays and vectors. The class maintains an internal offset to keep track
 * of the current deserialization position within the buffer, allowing for sequential deserialization
 * of multiple elements. Additionally, custom deserialization functions can be executed, offering
 * flexibility and extensibility for handling custom data types or structures.
 */
export class Deserializer {
  constructor(private buf: Buffer, private offset = 0) {}

  /**
 * Deserialize a boolean value from the buffer at the current offset.
 * Advances the buffer offset by one byte after deserialization.
 *
 * @returns The deserialized boolean value, either true or false.
 */
public bool() {
    return this.exec(deserializeBool) ? true : false;
  }

  /**
 * Deserialize an unsigned 32-bit integer from the internal buffer.
 * Advances the internal offset by 4 bytes after deserialization.
 *
 * @returns The deserialized unsigned 32-bit integer.
 */
public uInt32() {
    return this.exec(deserializeUInt32);
  }

  /**
 * Deserialize a signed 32-bit integer from the buffer.
 * The input buffer should have at least 4 bytes available starting from the current offset.
 * Advances the internal offset by 4 bytes after reading the value.
 *
 * @returns The deserialized signed 32-bit integer.
 */
public int32() {
    return this.exec(deserializeInt32);
  }

  /**
 * Deserialize a BigInt from the internal buffer using the specified width in bytes.
 * The 'bigInt' method reads the next 'width' bytes from the buffer, starting at the current offset,
 * and converts them into a BigInt. If the 'width' parameter is not provided, it defaults to 32 bytes.
 * After reading the value, it increments the internal offset by the number of bytes read.
 *
 * @param width - The number of bytes to read for the BigInt (default: 32).
 * @returns The deserialized BigInt value.
 */
public bigInt(width = 32) {
    return this.exec((buf: Buffer, offset: number) => deserializeBigInt(buf, offset, width));
  }

  /**
 * Deserialize a vector from the buffer and return it as a new Buffer object.
 * The vector is expected to be prefixed with its length encoded as a CompactSize unsigned integer.
 * Throws an error if the buffer size is insufficient or the length prefix is invalid.
 *
 * @returns A Buffer object containing the deserialized vector data.
 */
public vector() {
    return this.exec(deserializeBufferFromVector);
  }

  /**
 * Extracts a sub-buffer of the given width from the internal buffer starting at the current offset.
 * Advances the internal offset by the width after extraction.
 * Useful for extracting raw binary data of a specific size or when custom processing is needed.
 *
 * @param width - The width (in bytes) of the sub-buffer to extract.
 * @returns A Buffer instance containing the extracted data.
 */
public buffer(width: number) {
    const buf = this.buf.slice(this.offset, this.offset + width);
    this.offset += width;
    return buf;
  }

  /**
 * Deserialize a string from the internal buffer.
 * The string is read from the buffer starting at the current offset as a vector of bytes, then converted to a string.
 * Updates the internal offset position after the operation.
 *
 * @returns The deserialized string.
 */
public string() {
    return this.vector().toString();
  }

  /**
 * Deserialize a date object from the buffer using 8-byte BigInt as the underlying data.
 * The function reads an 8-byte BigInt from the current position of the buffer,
 * interprets it as milliseconds since UNIX epoch, and creates a new Date object.
 *
 * @returns A Date object representing the deserialized date value.
 */
public date() {
    return new Date(Number(this.bigInt(8)));
  }

  /**
 * Deserialize an array of elements from the buffer using the provided deserialization function.
 * The deserialization function should take a buffer and an offset as parameters and return
 * an object with two properties: 'elem' representing the deserialized element and 'adv'
 * denoting the number of bytes consumed during deserialization. This function updates the
 * internal offset according to the total bytes consumed.
 *
 * @param fn - The deserialization function used to deserialize individual elements of the array.
 * @returns An array of deserialized elements.
 */
public deserializeArray<T>(fn: DeserializeFn<T>) {
    return this.exec((buf: Buffer, offset: number) => deserializeArrayFromVector(fn, buf, offset));
  }

  /**
 * Executes the given deserialization function with the internal buffer and offset, updating the offset accordingly.
 * This method is useful for performing custom deserialization operations within the context of the Deserializer instance.
 *
 * @param fn - The deserialization function to be executed. It should accept a Buffer and an offset as its parameters and return an object containing 'elem' (the deserialized value) and 'adv' (the number of bytes processed).
 * @returns The deserialized value of type T obtained from the deserialization function.
 */
public exec<T>(fn: DeserializeFn<T>): T {
    const { elem, adv } = fn(this.buf, this.offset);
    this.offset += adv;
    return elem;
  }

  /**
 * Retrieves the current offset value of the Deserializer instance.
 * The offset is a numeric representation of the position within the buffer,
 * and it gets updated as the data elements are deserialized.
 *
 * @returns The current offset value as a number.
 */
public getOffset() {
    return this.offset;
  }
}
