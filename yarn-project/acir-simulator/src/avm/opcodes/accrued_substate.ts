import { AvmMachineState } from '../avm_machine_state.js';
import { AvmJournal } from '../journal/journal.js';
import {
  Opcode,
  OperandPair,
  OperandType,
  serialize,
} from '../serialization/instruction_serialization.js';
import { Instruction, 
} from './instruction.js';
import { StaticCallStorageAlterError } from './storage.js';

export class EmitNoteHash extends Instruction {
  static type: string = 'EMITNOTEHASH';
  static readonly opcode: Opcode = Opcode.EMITNOTEHASH;

  // Instruction wire format with opcode.
  static readonly wireFormat: OperandPair[] = [
    [(_: EmitNoteHash) => EmitNoteHash.opcode, OperandType.UINT8],
    [(c: EmitNoteHash) => c.indirect, OperandType.UINT8],
    [(c: EmitNoteHash) => c.noteHashOffset, OperandType.UINT32],
  ];

  constructor(private indirect: number, private noteHashOffset: number) {
    super();
  }

  public serialize(): Buffer {
    return serialize(EmitNoteHash.wireFormat, this);
  }

  async execute(machineState: AvmMachineState, journal: AvmJournal): Promise<void> {
    if (machineState.executionEnvironment.isStaticCall) {
      throw new StaticCallStorageAlterError();
    }

    const noteHash = machineState.memory.get(this.noteHashOffset).toFr();
    journal.writeNoteHash(noteHash);

    this.incrementPc(machineState);
  }
}

export class EmitNullifier extends Instruction {
  static type: string = 'EMITNULLIFIER';
  static readonly opcode: Opcode = Opcode.EMITNULLIFIER;

  // Instruction wire format with opcode.
  static readonly wireFormat: OperandPair[] = [
    [(_: EmitNullifier) => EmitNullifier.opcode, OperandType.UINT8],
    [(c: EmitNullifier) => c.indirect, OperandType.UINT8],
    [(c: EmitNullifier) => c.nullifierOffset, OperandType.UINT32],
  ];

  constructor(private indirect: number, private nullifierOffset: number) {
    super();
  }

  public serialize(): Buffer {
    return serialize(EmitNullifier.wireFormat, this);
  }

  async execute(machineState: AvmMachineState, journal: AvmJournal): Promise<void> {
    if (machineState.executionEnvironment.isStaticCall) {
      throw new StaticCallStorageAlterError();
    }

    const nullifier = machineState.memory.get(this.nullifierOffset).toFr();
    journal.writeNullifier(nullifier);

    this.incrementPc(machineState);
  }
}

export class EmitUnencryptedLog extends Instruction {
  static type: string = 'EMITUNENCRYPTEDLOG';
  static readonly opcode: Opcode = Opcode.EMITUNENCRYPTEDLOG;

  // Instruction wire format with opcode.
  static readonly wireFormat: OperandPair[] = [
    [(_: EmitUnencryptedLog) => EmitUnencryptedLog.opcode, OperandType.UINT8],
    [(c: EmitUnencryptedLog) => c.indirect, OperandType.UINT8],
    [(c: EmitUnencryptedLog) => c.logOffset, OperandType.UINT32],
    [(c: EmitUnencryptedLog) => c.logSize, OperandType.UINT32],
  ];

  constructor(private indirect: number, private logOffset: number, private logSize: number) {
    super();
  }

  public serialize(): Buffer {
    return serialize(EmitUnencryptedLog.wireFormat, this);
  }

  async execute(machineState: AvmMachineState, journal: AvmJournal): Promise<void> {
    if (machineState.executionEnvironment.isStaticCall) {
      throw new StaticCallStorageAlterError();
    }

    const log = machineState.memory.getSlice(this.logOffset, this.logSize).map(f => f.toFr());
    journal.writeLog(log);

    this.incrementPc(machineState);
  }
}

export class SendL2ToL1Message extends Instruction {
  static type: string = 'EMITUNENCRYPTEDLOG';
  static readonly opcode: Opcode = Opcode.SENDL2TOL1MSG;

  // Instruction wire format with opcode.
  static readonly wireFormat: OperandPair[] = [
    [(_: SendL2ToL1Message) => SendL2ToL1Message.opcode, OperandType.UINT8],
    [(c: SendL2ToL1Message) => c.indirect, OperandType.UINT8],
    [(c: SendL2ToL1Message) => c.msgOffset, OperandType.UINT32],
    [(c: SendL2ToL1Message) => c.msgSize, OperandType.UINT32],
  ];

  constructor(private indirect: number, private msgOffset: number, private msgSize: number) {
    super();
  }


  public serialize(): Buffer {
    return serialize(SendL2ToL1Message.wireFormat, this);
  }

  async execute(machineState: AvmMachineState, journal: AvmJournal): Promise<void> {
    if (machineState.executionEnvironment.isStaticCall) {
      throw new StaticCallStorageAlterError();
    }

    const msg = machineState.memory.getSlice(this.msgOffset, this.msgSize).map(f => f.toFr());
    journal.writeLog(msg);

    this.incrementPc(machineState);
  }
}
