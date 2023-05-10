import { numToUInt32BE, deserializeUInt32, BufferReader } from '@aztec/foundation/serialize';
import { serializeToBuffer } from '../utils/serialize.js';

const FUNCTION_SELECTOR_LENGTH = 4;

/**
 * Function description for circuit.
 * @see abis/function_data.hpp
 */
export class FunctionData {
  public functionSelectorBuffer: Buffer;
  constructor(functionSelector: Buffer | number, public isPrivate = true, public isConstructor = true) {
    if (functionSelector instanceof Buffer) {
      if (functionSelector.byteLength !== 4) {
        throw new Error(`Function selector must be 4 bytes long, got ${functionSelector.byteLength} bytes.`);
      }
      this.functionSelectorBuffer = functionSelector;
    } else {
      // create a new numeric buffer with 4 bytes
      this.functionSelectorBuffer = numToUInt32BE(functionSelector);
    }
  }
  // For serialization, must match function_selector name in C++ and return as number
  // TODO(AD) somehow remove this cruft, probably by using a buffer selector in C++
  get functionSelector(): number {
    return deserializeUInt32(this.functionSelectorBuffer).elem;
  }

  /**
   * Serialize this as a buffer.
   * @returns The buffer.
   */
  toBuffer(): Buffer {
    return serializeToBuffer(this.functionSelectorBuffer, this.isPrivate, this.isConstructor);
  }

  /**
   * Returns whether this instance is empty.
   * @returns True if the function selector is zero.
   */
  isEmpty() {
    return this.functionSelectorBuffer.equals(Buffer.alloc(FUNCTION_SELECTOR_LENGTH, 0));
  }

  public static empty(args?: { isPrivate?: boolean; isConstructor?: boolean }) {
    return new FunctionData(Buffer.alloc(FUNCTION_SELECTOR_LENGTH, 0), args?.isPrivate, args?.isConstructor);
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer to read from.
   */
  static fromBuffer(buffer: Buffer | BufferReader): FunctionData {
    const reader = BufferReader.asReader(buffer);
    return new FunctionData(reader.readBytes(FUNCTION_SELECTOR_LENGTH), reader.readBoolean(), reader.readBoolean());
  }
}
