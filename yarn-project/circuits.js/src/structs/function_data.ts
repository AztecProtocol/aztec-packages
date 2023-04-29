import { BufferReader, deserializeUInt32, numToUInt32BE } from '@aztec/foundation';
import { Buffer } from 'buffer';
import { serializeToBuffer } from '../utils/serialize.js';

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
  // For serialization, return as number
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

  public static empty() {
    return new FunctionData(Buffer.alloc(4, 0));
  }
  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer to read from.
   */
  static fromBuffer(buffer: Buffer | BufferReader): FunctionData {
    const reader = BufferReader.asReader(buffer);
    return new FunctionData(reader.readBytes(4), reader.readBoolean(), reader.readBoolean());
  }
}
