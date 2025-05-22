import type { AvmContext } from '../avm_context.js';
import { Field, TypeTag } from '../avm_memory_types.js';
import { StaticCallAlterationError } from '../errors.js';
import { Opcode, OperandType } from '../serialization/instruction_serialization.js';
import { Addressing } from './addressing_mode.js';
import { Instruction } from './instruction.js';

abstract class BaseStorageInstruction extends Instruction {
  // Informs (de)serialization. See Instruction.deserialize.
  public static readonly wireFormat: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT16,
    OperandType.UINT16,
  ];

  constructor(
    protected indirect: number,
    protected aOffset: number,
    protected bOffset: number,
  ) {
    super();
  }
}

export class SStore extends BaseStorageInstruction {
  static readonly type: string = 'SSTORE';
  static readonly opcode = Opcode.SSTORE;

  constructor(indirect: number, srcOffset: number, slotOffset: number) {
    super(indirect, srcOffset, slotOffset);
  }

  public async execute(context: AvmContext): Promise<void> {
    if (context.environment.isStaticCall) {
      throw new StaticCallAlterationError();
    }

    const memory = context.machineState.memory;
    const addressing = Addressing.fromWire(this.indirect);

    context.machineState.consumeGas(this.gasCost());

    const operands = [this.aOffset, this.bOffset];
    const [srcOffset, slotOffset] = addressing.resolve(operands, memory);
    memory.checkTag(TypeTag.FIELD, slotOffset);
    memory.checkTag(TypeTag.FIELD, srcOffset);

    const slot = memory.get(slotOffset).toFr();
    const value = memory.get(srcOffset).toFr();
    await context.persistableState.writeStorage(context.environment.address, slot, value);
  }
}

export class SLoad extends BaseStorageInstruction {
  static readonly type: string = 'SLOAD';
  static readonly opcode = Opcode.SLOAD;

  constructor(indirect: number, slotOffset: number, dstOffset: number) {
    super(indirect, slotOffset, dstOffset);
  }

  public async execute(context: AvmContext): Promise<void> {
    const memory = context.machineState.memory;
    const addressing = Addressing.fromWire(this.indirect);

    context.machineState.consumeGas(this.gasCost());

    const operands = [this.aOffset, this.bOffset];
    const [slotOffset, dstOffset] = addressing.resolve(operands, memory);
    memory.checkTag(TypeTag.FIELD, slotOffset);

    const slot = memory.get(slotOffset).toFr();
    const value = await context.persistableState.readStorage(context.environment.address, slot);
    memory.set(dstOffset, new Field(value));
  }
}
