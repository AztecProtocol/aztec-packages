import { ABIParameter } from '@aztec/foundation/abi';
import { keccak } from '@aztec/foundation/crypto';
import { BufferReader } from '@aztec/foundation/serialize';

import { FUNCTION_SELECTOR_NUM_BYTES } from '../cbind/constants.gen.js';

/**
 * A function selector is the first 4 bytes of the hash of a function signature.
 */
export class FunctionSelector {
  /**
   * The size of the hash in bytes.
   */
  public static SIZE = FUNCTION_SELECTOR_NUM_BYTES;

  constructor(/** buffer containing the function selector */ public value: Buffer) {
    if (value.length !== FunctionSelector.SIZE) {
      throw new Error(`Function selector must be ${FunctionSelector.SIZE} bytes long, got ${value.length} bytes.`);
    }
  }

  /**
   * Checks if the function selector is empty (all bytes are 0).
   * @returns True if the function selector is empty (all bytes are 0).
   */
  public isEmpty(): boolean {
    return this.value.equals(Buffer.alloc(FunctionSelector.SIZE));
  }

  /**
   * Serialize as a buffer.
   * @returns The buffer.
   */
  toBuffer(): Buffer {
    return this.value;
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer  or BufferReader to read from.
   * @returns The FunctionSelector.
   */
  static fromBuffer(buffer: Buffer | BufferReader): FunctionSelector {
    const reader = BufferReader.asReader(buffer);
    return new FunctionSelector(reader.readBytes(FunctionSelector.SIZE));
  }

  /**
   * Creates a function selector from a signature.
   * @param signature - Signature of the function to generate the selector for (e.g. "transfer(field,field)").
   * @returns Function selector.
   */
  static fromSignature(signature: string): FunctionSelector {
    return new FunctionSelector(keccak(Buffer.from(signature)).subarray(0, FunctionSelector.SIZE));
  }

  /**
   * Creates a function selector for a given function name and parameters.
   * @param name - The name of the function.
   * @param parameters - An array of ABIParameter objects, each containing the type information of a function parameter.
   * @returns A Buffer containing the 4-byte function selector.
   */
  static fromNameAndParameters(name: string, parameters: ABIParameter[]) {
    const signature = name === 'constructor' ? name : `${name}(${parameters.map(p => p.type.kind).join(',')})`;
    return FunctionSelector.fromSignature(signature);
  }

  /**
   * Creates an empty function selector.
   * @returns An empty function selector.
   */
  static empty(): FunctionSelector {
    return new FunctionSelector(Buffer.alloc(FunctionSelector.SIZE));
  }
}
