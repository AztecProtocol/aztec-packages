import { serializeToBuffer } from '../utils/serialize.js';

/**
 * Function description for circuit.
 * @see abis/function_data.hpp
 */
export class FunctionData {
  constructor(public functionSelector: Buffer, public isPrivate = true, public isConstructor = true) {
    if (functionSelector.byteLength !== 4) {
      throw new Error(`Function selector must be 4 bytes long, got ${functionSelector.byteLength} bytes.`);
    }
  }
  /**
   * Serialize this as a buffer.
   * @returns The buffer.
   */
  toBuffer(): Buffer {
    return serializeToBuffer(this.functionSelector, this.isPrivate, this.isConstructor);
  }
}
