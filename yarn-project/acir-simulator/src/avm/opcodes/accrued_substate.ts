import { Fr } from '@aztec/foundation/fields';

import { AvmMachineState } from '../avm_machine_state.js';
import { TypeTag } from '../avm_memory_types.js';
import { AvmJournal } from '../journal/journal.js';
import { Instruction } from './instruction.js';
import { StaticCallStorageAlterError } from './storage.js';

export class EmitNoteHash extends Instruction {
  static type: string = 'EMITNOTEHASH';
  static numberOfOperands = 1;

  constructor(private noteHashOffset: number) {
    super();
  }

  async execute(machineState: AvmMachineState, journal: AvmJournal): Promise<void> {
    if (machineState.executionEnvironment.isStaticCall) {
      throw new StaticCallStorageAlterError();
    }

    Instruction.checkTags(machineState, TypeTag.FIELD, this.noteHashOffset);
    const noteHash = machineState.memory.getAs<Fr>(this.noteHashOffset);

    journal.writeNoteHash(noteHash);

    this.incrementPc(machineState);
  }
}

export class EmitNullifier extends Instruction {
  static type: string = 'EMITNULLIFIER';
  static numberOfOperands = 1;

  constructor(private nullifierOffset: number) {
    super();
  }

  async execute(machineState: AvmMachineState, journal: AvmJournal): Promise<void> {
    if (machineState.executionEnvironment.isStaticCall) {
      throw new StaticCallStorageAlterError();
    }

    Instruction.checkTags(machineState, TypeTag.FIELD, this.nullifierOffset);
    const nullifier = machineState.memory.getAs<Fr>(this.nullifierOffset);

    journal.writeNullifier(nullifier);

    this.incrementPc(machineState);
  }
}

export class EmitUnencryptedLog extends Instruction {
  static type: string = 'EMITUNENCRYPTEDLOG';
  static numberOfOperands = 2;

  constructor(private logOffset: number, private logSize: number) {
    super();
  }

  async execute(machineState: AvmMachineState, journal: AvmJournal): Promise<void> {
    if (machineState.executionEnvironment.isStaticCall) {
      throw new StaticCallStorageAlterError();
    }

    // Check log tags are all fields
    Instruction.checkTagsRange(machineState, TypeTag.FIELD, this.logOffset, this.logSize);

    const log = machineState.memory.getSliceAs<Fr>(this.logOffset, this.logSize);

    journal.writeLog(log);

    this.incrementPc(machineState);
  }
}

export class SendL2ToL1Message extends Instruction {
  static type: string = 'EMITUNENCRYPTEDLOG';
  static numberOfOperands = 2;

  constructor(private msgOffset: number, private msgSize: number) {
    super();
  }

  async execute(machineState: AvmMachineState, journal: AvmJournal): Promise<void> {
    if (machineState.executionEnvironment.isStaticCall) {
      throw new StaticCallStorageAlterError();
    }

    // Check log tags are all fields
    Instruction.checkTagsRange(machineState, TypeTag.FIELD, this.msgOffset, this.msgSize);

    const msg = machineState.memory.getSliceAs<Fr>(this.msgOffset, this.msgSize);

    journal.writeLog(msg);

    this.incrementPc(machineState);
  }
}
