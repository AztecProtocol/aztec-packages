import { toBufferBE } from '@aztec/foundation/bigint-buffer';
import { Fr } from '@aztec/foundation/fields';
import { bufferToHex } from '@aztec/foundation/string';

import { inspect } from 'util';

/**
 * Base class for selectors in the Aztec protocol.
 *
 * A selector is a compact 4-byte identifier derived from hashing a signature string.
 * Selectors are used throughout Aztec to identify functions, events, and notes efficiently
 * without storing full signature strings.
 *
 * @remarks
 * The 4-byte size is a balance between:
 * - Collision resistance: 2^32 possible values provides sufficient uniqueness
 * - Efficiency: Small enough to minimize storage and calldata costs
 * - Compatibility: Aligns with Ethereum's function selector convention
 *
 * Selectors are computed by taking the last 4 bytes of a Poseidon2 hash of the signature.
 *
 * @example
 * ```typescript
 * // Selectors are typically created via specific subclasses:
 * const fnSelector = await FunctionSelector.fromSignature('transfer(field,field)');
 * const eventSelector = await EventSelector.fromSignature('Transfer(field,field,field)');
 * ```
 */
export abstract class Selector {
  /**
   * The size of the selector in bytes.
   * @remarks Fixed at 4 bytes (32 bits) for all selector types.
   */
  public static SIZE = 4;

  /**
   * Creates a new selector instance.
   * @param value - The numeric value of the selector (0 to 2^32 - 1)
   * @throws If value exceeds the maximum 32-bit unsigned integer
   */
  constructor(/** Value of the selector */ public value: number) {
    if (value > 2 ** (Selector.SIZE * 8) - 1) {
      throw new Error(`Selector must fit in ${Selector.SIZE} bytes (got value ${value}).`);
    }
  }

  /**
   * Checks if the selector is empty (all bytes are 0).
   * @returns True if the selector is empty (all bytes are 0).
   */
  public isEmpty(): boolean {
    return this.value === 0;
  }

  /**
   * Serializes the selector to a buffer.
   * @param bufferSize - The target buffer size (defaults to 4 bytes)
   * @returns The selector as a big-endian buffer
   * @remarks Uses big-endian encoding to match circuit expectations
   */
  toBuffer(bufferSize = Selector.SIZE): Buffer {
    return toBufferBE(BigInt(this.value), bufferSize);
  }

  /**
   * Serializes the selector to a hex string.
   * @returns The selector as a 0x-prefixed hex string (e.g., "0x12345678")
   */
  toString(): string {
    return bufferToHex(this.toBuffer());
  }

  /**
   * Custom inspection for debugging.
   * @returns A formatted string representation
   * @internal
   */
  [inspect.custom]() {
    return `Selector<${this.toString()}>`;
  }

  /**
   * Checks if this selector equals another selector.
   * @param other - The other selector to compare
   * @returns True if both selectors have the same numeric value
   */
  equals(other: Selector): boolean {
    return this.value === other.value;
  }

  /**
   * Converts the selector to a field element.
   * @returns The selector as a field element (Fr)
   * @remarks Useful for passing selectors to circuits that expect field elements
   */
  public toField() {
    return new Fr(BigInt(this.value));
  }
}
