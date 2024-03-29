import type { AvmContext } from '../avm_context.js';
import { IntegralValue } from '../avm_memory_types.js';
import { InstructionExecutionError } from '../errors.js';
import { Opcode, OperandType } from '../serialization/instruction_serialization.js';
import { FixedGasInstruction } from './fixed_gas_instruction.js';

export class Jump extends FixedGasInstruction {
  static type: string = 'JUMP';
  static readonly opcode: Opcode = Opcode.JUMP;
  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [OperandType.UINT8, OperandType.UINT32];

  constructor(private jumpOffset: number) {
    super();
  }

  protected async internalExecute(context: AvmContext): Promise<void> {
    context.machineState.pc = this.jumpOffset;
  }
}

export class JumpI extends FixedGasInstruction {
  static type: string = 'JUMPI';
  static readonly opcode: Opcode = Opcode.JUMPI;

  // Instruction wire format with opcode.
  static readonly wireFormat: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT32,
    OperandType.UINT32,
  ];

  constructor(private indirect: number, private loc: number, private condOffset: number) {
    super();
  }

  protected async internalExecute(context: AvmContext): Promise<void> {
    const condition = context.machineState.memory.getAs<IntegralValue>(this.condOffset);

    // TODO: reconsider this casting
    if (condition.toBigInt() == 0n) {
      context.machineState.incrementPc();
    } else {
      context.machineState.pc = this.loc;
    }
  }

  protected memoryOperations() {
    return { reads: 1 };
  }
}

export class InternalCall extends FixedGasInstruction {
  static readonly type: string = 'INTERNALCALL';
  static readonly opcode: Opcode = Opcode.INTERNALCALL;
  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [OperandType.UINT8, OperandType.UINT32];

  constructor(private loc: number) {
    super();
  }

  protected async internalExecute(context: AvmContext): Promise<void> {
    context.machineState.internalCallStack.push(context.machineState.pc + 1);
    context.machineState.pc = this.loc;
  }
}

export class InternalReturn extends FixedGasInstruction {
  static readonly type: string = 'INTERNALRETURN';
  static readonly opcode: Opcode = Opcode.INTERNALRETURN;
  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [OperandType.UINT8];

  constructor() {
    super();
  }

  protected async internalExecute(context: AvmContext): Promise<void> {
    const jumpOffset = context.machineState.internalCallStack.pop();
    if (jumpOffset === undefined) {
      throw new InstructionExecutionError('Internal call stack empty!');
    }
    context.machineState.pc = jumpOffset;
  }
}
