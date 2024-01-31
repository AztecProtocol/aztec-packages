import { Fr } from '@aztec/foundation/fields';

import { AvmMachineState } from '../avm_machine_state.js';
import { Field } from '../avm_memory_types.js';
import { AvmJournal } from '../journal/journal.js';
import { BufferCursor } from '../serialization/buffer_cursor.js';
import {
  Opcode,
  OperandPair,
  OperandType,
  deserialize,
  serialize,
} from '../serialization/instruction_serialization.js';
import { Instruction, InstructionExecutionError } from './instruction.js';

abstract class BaseStorageInstruction extends Instruction {
  // Instruction wire format with opcode.
  static readonly wireFormat: OperandPair[] = [
    [(c: BaseStorageInstruction) => c.opcode, OperandType.UINT8],
    [(c: BaseStorageInstruction) => c.indirect, OperandType.UINT8],
    [(c: BaseStorageInstruction) => c.aOffset, OperandType.UINT32],
    [(c: BaseStorageInstruction) => c.bOffset, OperandType.UINT32],
  ];

  constructor(protected indirect: number, protected aOffset: number, protected bOffset: number) {
    super();
  }

  protected static deserializeBase(buf: BufferCursor | Buffer): ConstructorParameters<typeof BaseStorageInstruction> {
    const res = deserialize(buf, BaseStorageInstruction.wireFormat);
    const params = res.slice(1); // Remove opcode.
    return params as ConstructorParameters<typeof BaseStorageInstruction>;
  }

  public serialize(): Buffer {
    return serialize(BaseStorageInstruction.wireFormat, this);
  }

  protected abstract get opcode(): Opcode;
}

export class SStore extends BaseStorageInstruction {
  static readonly type: string = 'SSTORE';
  static readonly opcode = Opcode.SSTORE;

  constructor(indirect: number, srcOffset: number, slotOffset: number) {
    super(indirect, srcOffset, slotOffset);
  }

  protected get opcode() {
    return SStore.opcode;
  }


  async execute(machineState: AvmMachineState, journal: AvmJournal): Promise<void> {
    if (machineState.executionEnvironment.isStaticCall) {
      throw new StaticCallStorageAlterError();
    }

    const slot = machineState.memory.get(this.aOffset);
    const data = machineState.memory.get(this.bOffset);

    journal.writeStorage(
      machineState.executionEnvironment.storageAddress,
      new Fr(slot.toBigInt()),
      new Fr(data.toBigInt()),
    );

    this.incrementPc(machineState);
  }
}

export class SLoad extends BaseStorageInstruction {
  static readonly type: string = 'SLOAD';
  static readonly opcode = Opcode.SLOAD;

  constructor(indirect: number, slotOffset: number, dstOffset: number) {
    super(indirect, slotOffset, dstOffset);
  }

  protected get opcode() {
    return SLoad.opcode;
  }


  async execute(machineState: AvmMachineState, journal: AvmJournal): Promise<void> {
    const slot = machineState.memory.get(this.aOffset);

    const data: Fr = await journal.readStorage(
      machineState.executionEnvironment.storageAddress,
      new Fr(slot.toBigInt()),
    );

    machineState.memory.set(this.bOffset, new Field(data));

    this.incrementPc(machineState);
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
