import type { AvmContext } from '../avm_context.js';
import { Field } from '../avm_memory_types.js';
import { InstructionExecutionError } from '../errors.js';
import { Opcode, OperandType } from '../serialization/instruction_serialization.js';
import { Addressing } from './addressing_mode.js';
import { Instruction } from './instruction.js';

abstract class BaseStorageInstruction extends Instruction {
  // Informs (de)serialization. See Instruction.deserialize.
  public static readonly wireFormat: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT32,
    OperandType.UINT32,
  ];

  constructor(protected indirect: number, protected aOffset: number, protected bOffset: number) {
    super();
  }
}

export class SStore extends BaseStorageInstruction {
  static readonly type: string = 'SSTORE';
  static readonly opcode = Opcode.SSTORE;

  constructor(indirect: number, srcOffset: number, slotOffset: number) {
    super(indirect, srcOffset, slotOffset);
  }

  async execute(context: AvmContext): Promise<void> {
    if (context.environment.isStaticCall) {
      throw new StaticCallStorageAlterError();
    }

    const [srcOffset, slotOffset] = Addressing.fromWire(this.indirect).resolve(
      [this.aOffset, this.bOffset],
      context.machineState.memory,
    );

    const slot = context.machineState.memory.get(slotOffset).toFr();
    const data = context.machineState.memory.get(srcOffset).toFr();

    context.persistableState.writeStorage(context.environment.storageAddress, slot, data);

    context.machineState.incrementPc();
  }
}

export class SLoad extends BaseStorageInstruction {
  static readonly type: string = 'SLOAD';
  static readonly opcode = Opcode.SLOAD;

  constructor(indirect: number, slotOffset: number, dstOffset: number) {
    super(indirect, slotOffset, dstOffset);
  }

  async execute(context: AvmContext): Promise<void> {
    const [aOffset, bOffset] = Addressing.fromWire(this.indirect).resolve(
      [this.aOffset, this.bOffset],
      context.machineState.memory,
    );

    const slot = context.machineState.memory.get(aOffset).toFr();
    const data = await context.persistableState.readStorage(context.environment.storageAddress, slot);
    context.machineState.memory.set(bOffset, new Field(data));

    context.machineState.incrementPc();
  }
}

/**
 * Error is thrown when a static call attempts to alter storage
 */
export class StaticCallStorageAlterError extends InstructionExecutionError {
  constructor() {
    super('Static calls cannot alter storage');
    this.name = 'StaticCallStorageAlterError';
  }
}
