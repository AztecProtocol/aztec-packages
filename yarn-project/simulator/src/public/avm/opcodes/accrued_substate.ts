import { NullifierCollisionError } from '../../state_manager/nullifiers.js';
import type { AvmContext } from '../avm_context.js';
import { TypeTag, Uint1 } from '../avm_memory_types.js';
import { InstructionExecutionError, StaticCallAlterationError } from '../errors.js';
import { Opcode, OperandType } from '../serialization/instruction_serialization.js';
import { Addressing } from './addressing_mode.js';
import { Instruction } from './instruction.js';

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
    private indirect: number,
    private noteHashOffset: number,
    private leafIndexOffset: number,
    private existsOffset: number,
  ) {
    super();
  }

  public async execute(context: AvmContext): Promise<void> {
    const memory = context.machineState.memory;
    const addressing = Addressing.fromWire(this.indirect);

    context.machineState.consumeGas(
      this.baseGasCost(addressing.indirectOperandsCount(), addressing.relativeOperandsCount()),
    );
    const operands = [this.noteHashOffset, this.leafIndexOffset, this.existsOffset];
    const [noteHashOffset, leafIndexOffset, existsOffset] = addressing.resolve(operands, memory);
    memory.checkTag(TypeTag.FIELD, noteHashOffset);
    memory.checkTag(TypeTag.UINT64, leafIndexOffset);

    // Note that this instruction accepts any type in memory, and converts to Field.
    const noteHash = memory.get(noteHashOffset).toFr();
    const leafIndex = memory.get(leafIndexOffset).toBigInt();

    const exists = await context.persistableState.checkNoteHashExists(context.environment.address, noteHash, leafIndex);
    memory.set(existsOffset, exists ? new Uint1(1) : new Uint1(0));
  }
}

export class EmitNoteHash extends Instruction {
  static type: string = 'EMITNOTEHASH';
  static readonly opcode: Opcode = Opcode.EMITNOTEHASH;
  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat = [OperandType.UINT8, OperandType.UINT8, OperandType.UINT16];

  constructor(
    private indirect: number,
    private noteHashOffset: number,
  ) {
    super();
  }

  public async execute(context: AvmContext): Promise<void> {
    const memory = context.machineState.memory;
    const addressing = Addressing.fromWire(this.indirect);

    context.machineState.consumeGas(
      this.baseGasCost(addressing.indirectOperandsCount(), addressing.relativeOperandsCount()),
    );

    const operands = [this.noteHashOffset];
    const [noteHashOffset] = addressing.resolve(operands, memory);
    memory.checkTag(TypeTag.FIELD, noteHashOffset);

    if (context.environment.isStaticCall) {
      throw new StaticCallAlterationError();
    }

    const noteHash = memory.get(noteHashOffset).toFr();
    await context.persistableState.writeNoteHash(context.environment.address, noteHash);
  }
}

export class NullifierExists extends Instruction {
  static type: string = 'NULLIFIEREXISTS';
  static readonly opcode: Opcode = Opcode.NULLIFIEREXISTS;
  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT16,
    OperandType.UINT16,
    OperandType.UINT16,
  ];

  constructor(
    private indirect: number,
    private nullifierOffset: number,
    private addressOffset: number,
    private existsOffset: number,
  ) {
    super();
  }

  public async execute(context: AvmContext): Promise<void> {
    const memory = context.machineState.memory;
    const addressing = Addressing.fromWire(this.indirect);

    context.machineState.consumeGas(
      this.baseGasCost(addressing.indirectOperandsCount(), addressing.relativeOperandsCount()),
    );

    const operands = [this.nullifierOffset, this.addressOffset, this.existsOffset];
    const [nullifierOffset, addressOffset, existsOffset] = addressing.resolve(operands, memory);
    memory.checkTags(TypeTag.FIELD, nullifierOffset, addressOffset);

    const nullifier = memory.get(nullifierOffset).toFr();
    const address = memory.get(addressOffset).toAztecAddress();
    const exists = await context.persistableState.checkNullifierExists(address, nullifier);

    memory.set(existsOffset, exists ? new Uint1(1) : new Uint1(0));
  }
}

export class EmitNullifier extends Instruction {
  static type: string = 'EMITNULLIFIER';
  static readonly opcode: Opcode = Opcode.EMITNULLIFIER;
  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat = [OperandType.UINT8, OperandType.UINT8, OperandType.UINT16];

  constructor(
    private indirect: number,
    private nullifierOffset: number,
  ) {
    super();
  }

  public async execute(context: AvmContext): Promise<void> {
    if (context.environment.isStaticCall) {
      throw new StaticCallAlterationError();
    }

    const memory = context.machineState.memory;
    const addressing = Addressing.fromWire(this.indirect);

    context.machineState.consumeGas(
      this.baseGasCost(addressing.indirectOperandsCount(), addressing.relativeOperandsCount()),
    );

    const operands = [this.nullifierOffset];
    const [nullifierOffset] = addressing.resolve(operands, memory);
    memory.checkTag(TypeTag.FIELD, nullifierOffset);

    const nullifier = memory.get(nullifierOffset).toFr();
    try {
      await context.persistableState.writeNullifier(context.environment.address, nullifier);
    } catch (e) {
      if (e instanceof NullifierCollisionError) {
        // Error is known/expected, raise as InstructionExecutionError that the will lead the simulator to revert this call
        throw new InstructionExecutionError(
          `Attempted to emit duplicate nullifier ${nullifier} (contract address: ${context.environment.address}).`,
        );
      } else {
        throw e;
      }
    }
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
    private indirect: number,
    private msgHashOffset: number,
    private msgLeafIndexOffset: number,
    private existsOffset: number,
  ) {
    super();
  }

  public async execute(context: AvmContext): Promise<void> {
    const memory = context.machineState.memory;
    const addressing = Addressing.fromWire(this.indirect);

    context.machineState.consumeGas(
      this.baseGasCost(addressing.indirectOperandsCount(), addressing.relativeOperandsCount()),
    );

    const operands = [this.msgHashOffset, this.msgLeafIndexOffset, this.existsOffset];
    const [msgHashOffset, msgLeafIndexOffset, existsOffset] = addressing.resolve(operands, memory);

    memory.checkTag(TypeTag.FIELD, msgHashOffset);
    memory.checkTag(TypeTag.UINT64, msgLeafIndexOffset);

    const msgHash = memory.get(msgHashOffset).toFr();
    const msgLeafIndex = memory.get(msgLeafIndexOffset).toFr();
    const exists = await context.persistableState.checkL1ToL2MessageExists(msgHash, msgLeafIndex);
    memory.set(existsOffset, exists ? new Uint1(1) : new Uint1(0));
  }
}

export class EmitUnencryptedLog extends Instruction {
  // TODO(#11124): rename unencrypted -> public
  static type: string = 'EMITUNENCRYPTEDLOG';
  static readonly opcode: Opcode = Opcode.EMITUNENCRYPTEDLOG;
  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat = [OperandType.UINT8, OperandType.UINT8, OperandType.UINT16, OperandType.UINT16];

  constructor(
    private indirect: number,
    private logOffset: number,
    private logSizeOffset: number,
  ) {
    super();
  }

  public async execute(context: AvmContext): Promise<void> {
    if (context.environment.isStaticCall) {
      throw new StaticCallAlterationError();
    }

    const memory = context.machineState.memory;
    const addressing = Addressing.fromWire(this.indirect);

    context.machineState.consumeGas(
      this.baseGasCost(addressing.indirectOperandsCount(), addressing.relativeOperandsCount()),
    );

    const operands = [this.logOffset, this.logSizeOffset];
    const [logOffset, logSizeOffset] = addressing.resolve(operands, memory);
    memory.checkTag(TypeTag.UINT32, logSizeOffset);
    const logSize = memory.get(logSizeOffset).toNumber();
    memory.checkTagsRange(TypeTag.FIELD, logOffset, logSize);

    const contractAddress = context.environment.address;

    context.machineState.consumeGas(this.dynamicGasCost(logSize));
    const log = memory.getSlice(logOffset, logSize).map(f => f.toFr());
    context.persistableState.writePublicLog(contractAddress, log);
  }
}

export class SendL2ToL1Message extends Instruction {
  static type: string = 'SENDL2TOL1MSG';
  static readonly opcode: Opcode = Opcode.SENDL2TOL1MSG;
  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat = [OperandType.UINT8, OperandType.UINT8, OperandType.UINT16, OperandType.UINT16];

  constructor(
    private indirect: number,
    private recipientOffset: number,
    private contentOffset: number,
  ) {
    super();
  }

  public async execute(context: AvmContext): Promise<void> {
    if (context.environment.isStaticCall) {
      throw new StaticCallAlterationError();
    }

    const memory = context.machineState.memory;
    const addressing = Addressing.fromWire(this.indirect);

    context.machineState.consumeGas(
      this.baseGasCost(addressing.indirectOperandsCount(), addressing.relativeOperandsCount()),
    );

    const operands = [this.recipientOffset, this.contentOffset];
    const [recipientOffset, contentOffset] = addressing.resolve(operands, memory);
    memory.checkTags(TypeTag.FIELD, recipientOffset, contentOffset);

    const recipient = memory.get(recipientOffset).toFr();
    const content = memory.get(contentOffset).toFr();
    context.persistableState.writeL2ToL1Message(context.environment.address, recipient, content);
  }
}
