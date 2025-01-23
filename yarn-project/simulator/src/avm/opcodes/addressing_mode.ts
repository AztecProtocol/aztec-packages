import { strict as assert } from 'assert';

import { TaggedMemory, type TaggedMemoryInterface } from '../avm_memory_types.js';
import { RelativeAddressOutOfRangeError } from '../errors.js';

export enum AddressingMode {
  DIRECT = 0,
  INDIRECT = 1,
  RELATIVE = 2,
  INDIRECT_RELATIVE = 3,
}

/** A class to represent the addressing mode of an instruction. */
export class Addressing {
  public constructor(
    /** The addressing mode for each operand. The length of this array is the number of operands of the instruction. */
    private readonly modePerOperand: AddressingMode[],
  ) {}

  // TODO(facundo): 8 for backwards compatibility.
  public static fromWire(wireModes: number, numOperands: number = 8): Addressing {
    // The modes are stored in the wire format as a byte, with each bit representing the mode for an operand.
    // The least significant bit represents the zeroth operand, and the most significant bit represents the last operand.
    const modes = new Array<AddressingMode>(numOperands);
    for (let i = 0; i < numOperands; i++) {
      modes[i] =
        (((wireModes >> i) & 1) * AddressingMode.INDIRECT) |
        (((wireModes >> (i + numOperands)) & 1) * AddressingMode.RELATIVE);
    }
    return new Addressing(modes);
  }

  public toWire(): number {
    // The modes are stored in the wire format as a byte, with each bit representing the mode for an operand.
    // The least significant bit represents the zeroth operand, and the least significant bit represents the last operand.
    let wire: number = 0;
    for (let i = 0; i < this.modePerOperand.length; i++) {
      if (this.modePerOperand[i] & AddressingMode.INDIRECT) {
        wire |= 1 << i;
      }
      if (this.modePerOperand[i] & AddressingMode.RELATIVE) {
        wire |= 1 << (this.modePerOperand.length + i);
      }
    }
    return wire;
  }

  /** Returns how many operands use the given addressing mode. */
  public count(mode: AddressingMode): number {
    return this.modePerOperand.filter(m => (m & mode) !== 0).length;
  }

  /**
   * Resolves the offsets using the addressing mode.
   * @param offsets The offsets to resolve.
   * @param mem The memory to use for resolution.
   * @returns The resolved offsets. The length of the returned array is the same as the length of the input array.
   */
  public resolve(offsets: number[], mem: TaggedMemoryInterface): number[] {
    assert(offsets.length <= this.modePerOperand.length);
    const resolved = new Array(offsets.length);
    for (const [i, offset] of offsets.entries()) {
      const mode = this.modePerOperand[i];
      resolved[i] = offset;
      if (mode & AddressingMode.RELATIVE) {
        mem.checkIsValidMemoryOffsetTag(0);
        const baseAddr = Number(mem.get(0).toBigInt());
        resolved[i] += baseAddr;
        if (resolved[i] >= TaggedMemory.MAX_MEMORY_SIZE) {
          throw new RelativeAddressOutOfRangeError(baseAddr, offset);
        }
      }
      if (mode & AddressingMode.INDIRECT) {
        mem.checkIsValidMemoryOffsetTag(resolved[i]);
        resolved[i] = Number(mem.get(resolved[i]).toBigInt());
      }
    }
    return resolved;
  }
}
