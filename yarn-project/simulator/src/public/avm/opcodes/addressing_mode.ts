import { AVM_MAX_OPERANDS } from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import type { Tuple } from '@aztec/foundation/serialize';

import { MemoryValue, TaggedMemory, type TaggedMemoryInterface, TypeTag } from '../avm_memory_types.js';
import { RelativeAddressOutOfRangeError, TagCheckError } from '../errors.js';

export enum AddressingMode {
  DIRECT = 0,
  INDIRECT = 1,
  RELATIVE = 2,
  INDIRECT_RELATIVE = 3,
}

/** A class to represent the addressing mode of an instruction. */
export class Addressing {
  public constructor(
    /** The addressing mode for each possible operand. */
    private readonly modePerOperand: Tuple<AddressingMode, typeof AVM_MAX_OPERANDS>,
  ) {}

  public static fromModes(modes: AddressingMode[]): Addressing {
    if (modes.length > AVM_MAX_OPERANDS) {
      throw new Error('Too many operands for addressing mode');
    }
    return new Addressing(padArrayEnd(modes, AddressingMode.DIRECT, AVM_MAX_OPERANDS));
  }

  public static fromWire(wireModes: number): Addressing {
    // The modes are stored in the wire format as one or two bytes, with each two bits representing the modes for an operand.
    // Even bits are indirect, odd bits are relative.
    const modes = new Array<AddressingMode>(AVM_MAX_OPERANDS);
    for (let i = 0; i < AVM_MAX_OPERANDS; i++) {
      modes[i] =
        (((wireModes >> (i * 2)) & 1) * AddressingMode.INDIRECT) |
        (((wireModes >> (i * 2 + 1)) & 1) * AddressingMode.RELATIVE);
    }
    // Casting the array to tuple since it should be more performant than using makeTuple
    return new Addressing(modes as Tuple<AddressingMode, typeof AVM_MAX_OPERANDS>);
  }

  public toWire(): number {
    // The modes are stored in the wire format as a byte, with each bit representing the mode for an operand.
    // The least significant bit represents the zeroth operand, and the least significant bit represents the last operand.
    let wire: number = 0;
    for (let i = 0; i < this.modePerOperand.length; i++) {
      if (this.modePerOperand[i] & AddressingMode.INDIRECT) {
        wire |= 1 << (i * 2);
      }
      if (this.modePerOperand[i] & AddressingMode.RELATIVE) {
        wire |= 1 << (i * 2 + 1);
      }
    }
    return wire;
  }

  public indirectOperandsCount(): number {
    return this.modePerOperand.filter(mode => mode & AddressingMode.INDIRECT).length;
  }

  public relativeOperandsCount(): number {
    return this.modePerOperand.filter(mode => mode & AddressingMode.RELATIVE).length;
  }

  /**
   * Resolves the offsets using the addressing mode.
   * @param offsets The offsets to resolve.
   * @param mem The memory to use for resolution.
   * @returns The resolved offsets. The length of the returned array is the same as the length of the input array and the resolved offsets are guaranteed to be valid addresses.
   * @throws An error if any step failed. Should be treated as a black box.
   */
  public resolve(offsets: number[], mem: TaggedMemoryInterface): number[] {
    const resolved: number[] = new Array(offsets.length);
    // These will be read (once) if we have any relative operands.
    let baseAddr: MemoryValue | undefined;

    for (const [i, offset] of offsets.entries()) {
      const mode = this.modePerOperand[i];
      // The given offsets are assumed to be valid addresses.
      resolved[i] = offset;
      if (mode & AddressingMode.RELATIVE) {
        if (!baseAddr) {
          baseAddr = mem.get(0);
          const baseAddrTag = baseAddr.getTag();
          if (!TaggedMemory.isValidMemoryAddressTag(baseAddrTag!)) {
            throw TagCheckError.forOffset(0, TypeTag[baseAddrTag!], TypeTag[TypeTag.UINT32]);
          }
        }
        // Here we know that resolved[i] is at most 32 bits and baseAddr is at most 32 bits.
        // Therefore, the addition is safe since the `number` type fits more than 33 bits.
        resolved[i] += Number(baseAddr.toBigInt());
        if (resolved[i] >= TaggedMemory.MAX_MEMORY_SIZE) {
          throw new RelativeAddressOutOfRangeError(Number(baseAddr.toBigInt()), offset);
        }
      }
      if (mode & AddressingMode.INDIRECT) {
        // At this point we know that resolved[i] is a valid memory address.
        const resolvedValue = mem.get(resolved[i]);
        const resolvedTag = resolvedValue.getTag();

        // Final check.
        if (!TaggedMemory.isValidMemoryAddressTag(resolvedTag)) {
          throw TagCheckError.forOffset(resolved[i], TypeTag[resolvedTag], TypeTag[TypeTag.UINT32]);
        }

        resolved[i] = Number(resolvedValue.toBigInt());
      }
    }
    return resolved;
  }
}
