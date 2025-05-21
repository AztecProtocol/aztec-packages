import type { AvmContext } from '../avm_context.js';
import type { IntegralValue } from '../avm_memory_types.js';
import { InstructionExecutionError } from '../errors.js';
import { Opcode, OperandType } from '../serialization/instruction_serialization.js';
import { Addressing } from './addressing_mode.js';
import { Instruction } from './instruction.js';

export class Jump extends Instruction {
  static type: string = 'JUMP';
  static readonly opcode: Opcode = Opcode.JUMP_32;
  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [OperandType.UINT8, OperandType.UINT32];

  constructor(private jumpOffset: number) {
    super();
  }

  public async execute(context: AvmContext): Promise<void> {
    context.machineState.consumeGas(this.gasCost());

    context.machineState.pc = this.jumpOffset;
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
    private indirect: number,
    private condOffset: number,
    private loc: number,
  ) {
    super();
  }

  public async execute(context: AvmContext): Promise<void> {
    const memory = context.machineState.memory;
    const addressing = Addressing.fromWire(this.indirect);

    context.machineState.consumeGas(this.gasCost());

    const operands = [this.condOffset];
    const [condOffset] = addressing.resolve(operands, memory);
    const condition = memory.getAs<IntegralValue>(condOffset);

    if (condition.toBigInt() == 0n) {
      context.machineState.pc = context.machineState.nextPc;
    } else {
      context.machineState.pc = this.loc;
    }
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

  public async execute(context: AvmContext): Promise<void> {
    context.machineState.consumeGas(this.gasCost());

    context.machineState.internalCallStack.push({
      callPc: context.machineState.pc,
      returnPc: context.machineState.nextPc,
    });
    context.machineState.pc = this.loc;
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

  public async execute(context: AvmContext): Promise<void> {
    context.machineState.consumeGas(this.gasCost());

    const stackEntry = context.machineState.internalCallStack.pop();
    if (stackEntry === undefined) {
      throw new InstructionExecutionError('Internal call stack empty!');
    }
    context.machineState.pc = stackEntry.returnPc;
  }

  public override handlesPC(): boolean {
    return true;
  }
}
