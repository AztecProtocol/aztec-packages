import { AVM_MAX_OPERANDS } from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { Tuple } from '@aztec/foundation/serialize';

import { strict as assert } from 'assert';

import { MemoryValue, TaggedMemory, type TaggedMemoryInterface, TypeTag } from './avm_memory_types.js';
import { RelativeAddressOutOfRangeError, TagCheckError } from './errors.js';
import { Instruction } from './instruction.js';
import { Opcode, OperandType } from './serialization/instruction_serialization.js';

/** Wire format that informs deserialization for instructions with three operands. */
export const ThreeOperandWireFormat8 = [
  OperandType.UINT8,
  OperandType.UINT8,
  OperandType.UINT8,
  OperandType.UINT8,
  OperandType.UINT8,
];
export const ThreeOperandWireFormat16 = [
  OperandType.UINT8,
  OperandType.UINT8,
  OperandType.UINT16,
  OperandType.UINT16,
  OperandType.UINT16,
];

/**
 * Covers (de)serialization for an instruction with:
 * addressing mode, inTag, and three operands.
 */
export abstract class ThreeOperandInstruction extends Instruction {
  static readonly wireFormat8: OperandType[] = ThreeOperandWireFormat8;
  static readonly wireFormat16: OperandType[] = ThreeOperandWireFormat16;

  constructor(
    protected addressingMode: number,
    protected aOffset: number,
    protected bOffset: number,
    protected dstOffset: number,
  ) {
    super();
  }
}

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
    assert(modes.length <= AVM_MAX_OPERANDS, 'Too many operands for addressing mode');
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
            throw TagCheckError.forBaseAddress(TypeTag[baseAddrTag!]);
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
          throw TagCheckError.forIndirectAddress(resolved[i], TypeTag[resolvedTag]);
        }

        resolved[i] = Number(resolvedValue.toBigInt());
      }
    }
    return resolved;
  }
}

export abstract class ThreeOperandArithmeticInstruction extends ThreeOperandInstruction {}

export class Add extends ThreeOperandArithmeticInstruction {
  static readonly type: string = 'ADD';
  static readonly opcode = Opcode.ADD_8; // FIXME: needed for gas.
}

export class Sub extends ThreeOperandArithmeticInstruction {
  static readonly type: string = 'SUB';
  static readonly opcode = Opcode.SUB_8; // FIXME: needed for gas.
}

export class Mul extends ThreeOperandArithmeticInstruction {
  static type: string = 'MUL';
  static readonly opcode = Opcode.MUL_8; // FIXME: needed for gas.
}

export class Div extends ThreeOperandArithmeticInstruction {
  static type: string = 'DIV';
  static readonly opcode = Opcode.DIV_8; // FIXME: needed for gas.
}

export class FieldDiv extends ThreeOperandArithmeticInstruction {
  static type: string = 'FDIV';
  static readonly opcode = Opcode.FDIV_8; // FIXME: needed for gas.
}

export class Shl extends ThreeOperandArithmeticInstruction {
  static readonly type: string = 'SHL';
  static readonly opcode = Opcode.SHL_8; // FIXME: needed for gas.
}

export class Shr extends ThreeOperandArithmeticInstruction {
  static readonly type: string = 'SHR';
  static readonly opcode = Opcode.SHR_8; // FIXME: needed for gas.
}

abstract class ThreeOperandBitwiseInstruction extends ThreeOperandInstruction {}

export class And extends ThreeOperandBitwiseInstruction {
  static readonly type: string = 'AND';
  static readonly opcode = Opcode.AND_8; // FIXME: needed for gas.
}

export class Or extends ThreeOperandBitwiseInstruction {
  static readonly type: string = 'OR';
  static readonly opcode = Opcode.OR_8; // FIXME: needed for gas.
}

export class Xor extends ThreeOperandBitwiseInstruction {
  static readonly type: string = 'XOR';
  static readonly opcode = Opcode.XOR_8; // FIXME: needed for gas.
}

export class Not extends Instruction {
  static readonly type: string = 'NOT';
  static readonly opcode = Opcode.NOT_8;

  static readonly wireFormat8 = [OperandType.UINT8, OperandType.UINT8, OperandType.UINT8, OperandType.UINT8];
  static readonly wireFormat16 = [OperandType.UINT8, OperandType.UINT8, OperandType.UINT16, OperandType.UINT16];

  constructor(
    private addressingMode: number,
    private srcOffset: number,
    private dstOffset: number,
  ) {
    super();
  }
}

abstract class ComparatorInstruction extends ThreeOperandInstruction {}

export class Eq extends ComparatorInstruction {
  static readonly type: string = 'EQ';
  static readonly opcode = Opcode.EQ_8; // FIXME: needed for gas.
}

export class Lt extends ComparatorInstruction {
  static readonly type: string = 'LT';
  static readonly opcode = Opcode.LT_8; // FIXME: needed for gas.
}

export class Lte extends ComparatorInstruction {
  static readonly type: string = 'LTE';
  static readonly opcode = Opcode.LTE_8; // FIXME: needed for gas.
}

export class Set extends Instruction {
  static readonly type: string = 'SET';
  // Required for gas.
  static readonly opcode: Opcode = Opcode.SET_8;

  public static readonly wireFormat8: OperandType[] = [
    OperandType.UINT8, // opcode
    OperandType.UINT8, // addressing_mode
    OperandType.UINT8, // dstOffset
    OperandType.TAG, // tag
    OperandType.UINT8, // const (value)
  ];
  public static readonly wireFormat16: OperandType[] = [
    OperandType.UINT8, // opcode
    OperandType.UINT8, // addressing_mode
    OperandType.UINT16, // dstOffset
    OperandType.TAG, // tag
    OperandType.UINT16, // const (value)
  ];
  public static readonly wireFormat32: OperandType[] = [
    OperandType.UINT8, // opcode
    OperandType.UINT8, // addressing_mode
    OperandType.UINT16, // dstOffset
    OperandType.TAG, // tag
    OperandType.UINT32, // const (value)
  ];
  public static readonly wireFormat64: OperandType[] = [
    OperandType.UINT8, // opcode
    OperandType.UINT8, // addressing_mode
    OperandType.UINT16, // dstOffset
    OperandType.TAG, // tag
    OperandType.UINT64, // const (value)
  ];
  public static readonly wireFormat128: OperandType[] = [
    OperandType.UINT8, // opcode
    OperandType.UINT8, // addressing_mode
    OperandType.UINT16, // dstOffset
    OperandType.TAG, // tag
    OperandType.UINT128, // const (value)
  ];
  public static readonly wireFormatFF: OperandType[] = [
    OperandType.UINT8, // opcode
    OperandType.UINT8, // addressing_mode
    OperandType.UINT16, // dstOffset
    OperandType.TAG, // tag
    OperandType.FF, // const (value)
  ];

  constructor(
    private addressingMode: number,
    private dstOffset: number,
    private inTag: number,
    private value: bigint | number,
  ) {
    super();
    assert(this.value >= 0, `Value ${this.value} is negative`);
    assert(this.value < Fr.MODULUS, `Value ${this.value} is larger than Fr.MODULUS`);
  }
}

export class Cast extends Instruction {
  static readonly type: string = 'CAST';
  static readonly opcode = Opcode.CAST_8;

  static readonly wireFormat8 = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.TAG,
  ];
  static readonly wireFormat16 = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT16,
    OperandType.UINT16,
    OperandType.TAG,
  ];

  constructor(
    private addressingMode: number,
    private srcOffset: number,
    private dstOffset: number,
    private dstTag: number,
  ) {
    super();
  }
}

export class Mov extends Instruction {
  static readonly type: string = 'MOV';
  // FIXME: This is needed for gas.
  static readonly opcode: Opcode = Opcode.MOV_8;

  static readonly wireFormat8: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT8,
  ];
  static readonly wireFormat16: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT16,
    OperandType.UINT16,
  ];

  constructor(
    private addressingMode: number,
    private srcOffset: number,
    private dstOffset: number,
  ) {
    super();
  }
}

export class CalldataCopy extends Instruction {
  static readonly type: string = 'CALLDATACOPY';
  static readonly opcode: Opcode = Opcode.CALLDATACOPY;
  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT16,
    OperandType.UINT16,
    OperandType.UINT16,
  ];

  constructor(
    private addressingMode: number,
    private copySizeOffset: number,
    private cdStartOffset: number,
    private dstOffset: number,
  ) {
    super();
  }
}

export class ReturndataSize extends Instruction {
  static readonly type: string = 'RETURNDATASIZE';
  static readonly opcode: Opcode = Opcode.RETURNDATASIZE;
  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [OperandType.UINT8, OperandType.UINT8, OperandType.UINT16];

  constructor(
    private addressingMode: number,
    private dstOffset: number,
  ) {
    super();
  }
}

export class ReturndataCopy extends Instruction {
  static readonly type: string = 'RETURNDATACOPY';
  static readonly opcode: Opcode = Opcode.RETURNDATACOPY;
  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT16,
    OperandType.UINT16,
    OperandType.UINT16,
  ];

  constructor(
    private addressingMode: number,
    private copySizeOffset: number,
    private rdStartOffset: number,
    private dstOffset: number,
  ) {
    super();
  }
}

export class Jump extends Instruction {
  static type: string = 'JUMP';
  static readonly opcode: Opcode = Opcode.JUMP_32;
  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [OperandType.UINT8, OperandType.UINT32];

  constructor(private jumpOffset: number) {
    super();
  }

  public override handlesPC(): boolean {
    return true;
  }
}

export class JumpI extends Instruction {
  static type: string = 'JUMPI';
  static readonly opcode: Opcode = Opcode.JUMPI_32;

  // Instruction wire format with opcode.
  static readonly wireFormat: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT16,
    OperandType.UINT32,
  ];

  constructor(
    private addressingMode: number,
    private condOffset: number,
    private loc: number,
  ) {
    super();
  }

  public override handlesPC(): boolean {
    return true;
  }
}

export class InternalCall extends Instruction {
  static readonly type: string = 'INTERNALCALL';
  static readonly opcode: Opcode = Opcode.INTERNALCALL;
  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [OperandType.UINT8, OperandType.UINT32];

  constructor(private loc: number) {
    super();
  }

  public override handlesPC(): boolean {
    return true;
  }
}

export class InternalReturn extends Instruction {
  static readonly type: string = 'INTERNALRETURN';
  static readonly opcode: Opcode = Opcode.INTERNALRETURN;
  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [OperandType.UINT8];

  constructor() {
    super();
  }

  public override handlesPC(): boolean {
    return true;
  }
}

export class SStore extends Instruction {
  static readonly type: string = 'SSTORE';
  static readonly opcode = Opcode.SSTORE;
  // Informs (de)serialization. See Instruction.deserialize.
  public static readonly wireFormat: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT16,
    OperandType.UINT16,
  ];

  constructor(
    private addressingMode: number,
    private srcOffset: number,
    private slotOffset: number,
  ) {
    super();
  }
}

export class SLoad extends Instruction {
  static readonly type: string = 'SLOAD';
  static readonly opcode = Opcode.SLOAD;
  // Informs (de)serialization. See Instruction.deserialize.
  public static readonly wireFormat: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT16,
    OperandType.UINT16,
    OperandType.UINT16,
  ];

  constructor(
    private addressingMode: number,
    private slotOffset: number,
    private contractAddressOffset: number,
    private dstOffset: number,
  ) {
    super();
  }
}

export class NoteHashExists extends Instruction {
  static type: string = 'NOTEHASHEXISTS';
  static readonly opcode: Opcode = Opcode.NOTEHASHEXISTS;
  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT16,
    OperandType.UINT16,
    OperandType.UINT16,
  ];

  constructor(
    private addressingMode: number,
    private noteHashOffset: number,
    private leafIndexOffset: number,
    private existsOffset: number,
  ) {
    super();
  }
}

export class EmitNoteHash extends Instruction {
  static type: string = 'EMITNOTEHASH';
  static readonly opcode: Opcode = Opcode.EMITNOTEHASH;
  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat = [OperandType.UINT8, OperandType.UINT8, OperandType.UINT16];

  constructor(
    private addressingMode: number,
    private noteHashOffset: number,
  ) {
    super();
  }
}

export class NullifierExists extends Instruction {
  static type: string = 'NULLIFIEREXISTS';
  static readonly opcode: Opcode = Opcode.NULLIFIEREXISTS;
  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat = [OperandType.UINT8, OperandType.UINT8, OperandType.UINT16, OperandType.UINT16];

  constructor(
    private addressingMode: number,
    private siloedNullifierOffset: number,
    private existsOffset: number,
  ) {
    super();
  }
}

export class EmitNullifier extends Instruction {
  static type: string = 'EMITNULLIFIER';
  static readonly opcode: Opcode = Opcode.EMITNULLIFIER;
  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat = [OperandType.UINT8, OperandType.UINT8, OperandType.UINT16];

  constructor(
    private addressingMode: number,
    private nullifierOffset: number,
  ) {
    super();
  }
}

export class L1ToL2MessageExists extends Instruction {
  static type: string = 'L1TOL2MSGEXISTS';
  static readonly opcode: Opcode = Opcode.L1TOL2MSGEXISTS;
  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT16,
    OperandType.UINT16,
    OperandType.UINT16,
  ];

  constructor(
    private addressingMode: number,
    private msgHashOffset: number,
    private msgLeafIndexOffset: number,
    private existsOffset: number,
  ) {
    super();
  }
}

export class EmitPublicLog extends Instruction {
  static type: string = 'EMITPUBLICLOG';
  static readonly opcode: Opcode = Opcode.EMITPUBLICLOG;
  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat = [OperandType.UINT8, OperandType.UINT8, OperandType.UINT16, OperandType.UINT16];

  constructor(
    private addressingMode: number,
    private logSizeOffset: number,
    private logOffset: number,
  ) {
    super();
  }
}

export class SendL2ToL1Message extends Instruction {
  static type: string = 'SENDL2TOL1MSG';
  static readonly opcode: Opcode = Opcode.SENDL2TOL1MSG;
  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat = [OperandType.UINT8, OperandType.UINT8, OperandType.UINT16, OperandType.UINT16];

  constructor(
    private addressingMode: number,
    private recipientOffset: number,
    private contentOffset: number,
  ) {
    super();
  }
}

export enum ContractInstanceMember {
  DEPLOYER,
  CLASS_ID,
  INIT_HASH,
  IMMUTABLES_HASH,
}

export class GetContractInstance extends Instruction {
  static readonly type: string = 'GETCONTRACTINSTANCE';
  static readonly opcode: Opcode = Opcode.GETCONTRACTINSTANCE;
  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [
    OperandType.UINT8, // opcode
    OperandType.UINT8, // addressing_mode bits
    OperandType.UINT16, // addressOffset
    OperandType.UINT16, // dstOffset
    OperandType.UINT8, // member enum (immediate)
  ];

  constructor(
    private addressingMode: number,
    private addressOffset: number,
    private dstOffset: number,
    private memberEnum: number,
  ) {
    super();
  }
}

export enum EnvironmentVariable {
  ADDRESS,
  SENDER,
  TRANSACTIONFEE,
  CHAINID,
  VERSION,
  BLOCKNUMBER,
  TIMESTAMP,
  MINFEEPERL2GAS,
  MINFEEPERDAGAS,
  ISSTATICCALL,
  L2GASLEFT,
  DAGASLEFT,
}

export class GetEnvVar extends Instruction {
  public static readonly type: string = 'GETENVVAR';
  public static readonly opcode: Opcode = Opcode.GETENVVAR_16;
  static readonly wireFormat16: OperandType[] = [
    OperandType.UINT8, // opcode
    OperandType.UINT8, // addressing_mode
    OperandType.UINT16, // dstOffset
    OperandType.UINT8, // variable enum (immediate)
  ];

  constructor(
    private addressingMode: number,
    private dstOffset: number,
    private varEnum: number,
  ) {
    super();
  }
}

abstract class ExternalCall extends Instruction {
  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT16, // addressing_mode
    OperandType.UINT16, // L2 gas offset
    OperandType.UINT16, // DA gas offset
    OperandType.UINT16, // Address offset
    OperandType.UINT16, // Args size offset
    OperandType.UINT16, // Args offset
  ];

  constructor(
    private addressingMode: number,
    private l2GasOffset: number,
    private daGasOffset: number,
    private addrOffset: number,
    private argsSizeOffset: number,
    private argsOffset: number,
  ) {
    super();
  }
}

export class Call extends ExternalCall {
  static type = 'CALL' as const;
  static readonly opcode: Opcode = Opcode.CALL;
}

export class StaticCall extends ExternalCall {
  static type = 'STATICCALL' as const;
  static readonly opcode: Opcode = Opcode.STATICCALL;
}

export class SuccessCopy extends Instruction {
  static type: string = 'SUCCESSCOPY';
  static readonly opcode: Opcode = Opcode.SUCCESSCOPY;
  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT8, // Indirect (8-bit)
    OperandType.UINT16, // dstOffset (16-bit)
  ];

  constructor(
    private addressingMode: number,
    private dstOffset: number,
  ) {
    super();
  }
}

export class Return extends Instruction {
  static type: string = 'RETURN';
  static readonly opcode: Opcode = Opcode.RETURN;
  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT16,
    OperandType.UINT16,
  ];

  constructor(
    private addressingMode: number,
    private returnSizeOffset: number,
    private returnOffset: number,
  ) {
    super();
  }

  public override handlesPC(): boolean {
    return true;
  }
}

export class Revert extends Instruction {
  static type: string = 'REVERT';
  static readonly opcode: Opcode = Opcode.REVERT_8;

  static readonly wireFormat8: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT8,
  ];
  static readonly wireFormat16: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT16,
    OperandType.UINT16,
  ];

  constructor(
    private addressingMode: number,
    private retSizeOffset: number,
    private returnOffset: number,
  ) {
    super();
  }

  // We don't want to increase the PC after reverting because it breaks messages.
  // Maybe we can remove this once messages don't depend on PCs.
  public override handlesPC(): boolean {
    return true;
  }
}

export class Poseidon2 extends Instruction {
  static type: string = 'POSEIDON2';
  static readonly opcode: Opcode = Opcode.POSEIDON2;
  static readonly stateSize = 4;

  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT16,
    OperandType.UINT16,
  ];

  constructor(
    private addressingMode: number,
    private inputStateOffset: number,
    private outputStateOffset: number,
  ) {
    super();
  }
}

export class KeccakF1600 extends Instruction {
  static type: string = 'KECCAKF1600';
  static readonly opcode: Opcode = Opcode.KECCAKF1600;

  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT16,
    OperandType.UINT16,
  ];

  constructor(
    private addressingMode: number,
    private dstOffset: number,
    private inputOffset: number,
  ) {
    super();
  }
}

export class Sha256Compression extends Instruction {
  static type: string = 'SHA256COMPRESSION';
  static readonly opcode: Opcode = Opcode.SHA256COMPRESSION;

  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT16,
    OperandType.UINT16,
    OperandType.UINT16,
  ];

  constructor(
    private addressingMode: number,
    private outputOffset: number,
    private stateOffset: number,
    private inputsOffset: number,
  ) {
    super();
  }
}

export class EcAdd extends Instruction {
  static type: string = 'ECADD';
  static readonly opcode = Opcode.ECADD;

  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [
    OperandType.UINT8, // reserved
    OperandType.UINT16, // indirect
    OperandType.UINT16, // p1X
    OperandType.UINT16, // p1Y
    OperandType.UINT16, // p2X
    OperandType.UINT16, // p2Y
    OperandType.UINT16, // dst
  ];

  constructor(
    private addressingMode: number,
    private p1XOffset: number,
    private p1YOffset: number,
    private p2XOffset: number,
    private p2YOffset: number,
    private dstOffset: number,
  ) {
    super();
  }
}

export class ToRadixBE extends Instruction {
  static type: string = 'TORADIXBE';
  static readonly opcode: Opcode = Opcode.TORADIXBE;

  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [
    OperandType.UINT8, // Opcode
    OperandType.UINT16, // addressing_mode
    OperandType.UINT16, // src memory address
    OperandType.UINT16, // radix memory address
    OperandType.UINT16, // number of limbs address
    OperandType.UINT16, // output is in "bits" mode memory address (boolean/Uint1 is stored)
    OperandType.UINT16, // dst memory address
  ];

  constructor(
    private addressingMode: number,
    private srcOffset: number,
    private radixOffset: number,
    private numLimbsOffset: number,
    private outputBitsOffset: number,
    private dstOffset: number,
  ) {
    super();
  }
}

export class DebugLog extends Instruction {
  static type: string = 'DEBUGLOG';
  static readonly opcode: Opcode = Opcode.DEBUGLOG;

  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [
    OperandType.UINT8, // Opcode
    OperandType.UINT8, // Indirect
    OperandType.UINT16, // level memory address
    OperandType.UINT16, // message memory address
    OperandType.UINT16, // fields memory address
    OperandType.UINT16, // fields size address
    OperandType.UINT16, // message size
  ];

  constructor(
    private addressingMode: number,
    private levelOffset: number,
    private messageOffset: number,
    private fieldsOffset: number,
    private fieldsSizeOffset: number,
    private messageSize: number,
  ) {
    super();
  }
}
