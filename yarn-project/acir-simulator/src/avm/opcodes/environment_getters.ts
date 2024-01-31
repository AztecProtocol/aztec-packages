import { AvmExecutionEnvironment } from '../avm_execution_environment.js';
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
import { Instruction } from './instruction.js';

abstract class GetterInstruction extends Instruction {
  // Instruction wire format with opcode.
  private static readonly wireFormat: OperandPair[] = [
    [(c: GetterInstruction) => c.opcode, OperandType.UINT8],
    [(c: GetterInstruction) => c.indirect, OperandType.UINT8],
    [(c: GetterInstruction) => c.dstOffset, OperandType.UINT32],
  ];

  constructor(protected indirect: number, protected dstOffset: number) {
    super();
  }

  protected static deserializeBase(buf: BufferCursor | Buffer): ConstructorParameters<typeof GetterInstruction> {
    const res = deserialize(buf, GetterInstruction.wireFormat);
    const params = res.slice(1); // Remove opcode.
    return params as ConstructorParameters<typeof GetterInstruction>;
  }

  public serialize(): Buffer {
    return serialize(GetterInstruction.wireFormat, this);
  }

  async execute(machineState: AvmMachineState, _journal: AvmJournal): Promise<void> {
    const res = new Field(this.getIt(machineState.executionEnvironment));
    machineState.memory.set(this.dstOffset, res);
    this.incrementPc(machineState);
  }

  protected abstract get opcode(): Opcode;
  protected abstract getIt(env: AvmExecutionEnvironment): any;
}

export class Address extends GetterInstruction {
  static type: string = 'ADDRESS';
  static readonly opcode: Opcode = Opcode.ADDRESS;

  protected get opcode() {
    return Address.opcode;
  }
  protected getIt(env: AvmExecutionEnvironment): any {
    return env.address;
  }
  public static deserialize(buf: BufferCursor | Buffer): Address {
    return new Address(...GetterInstruction.deserializeBase(buf));
  }
}

export class StorageAddress extends GetterInstruction {
  static type: string = 'STORAGEADDRESS';
  static readonly opcode: Opcode = Opcode.STORAGEADDRESS;

  protected get opcode() {
    return StorageAddress.opcode;
  }
  protected getIt(env: AvmExecutionEnvironment): any {
    return env.storageAddress;
  }
  public static deserialize(buf: BufferCursor | Buffer): StorageAddress {
    return new StorageAddress(...GetterInstruction.deserializeBase(buf));
  }
}

export class Sender extends GetterInstruction {
  static type: string = 'SENDER';
  static readonly opcode: Opcode = Opcode.SENDER;

  protected get opcode() {
    return Sender.opcode;
  }
  protected getIt(env: AvmExecutionEnvironment): any {
    return env.sender;
  }
  public static deserialize(buf: BufferCursor | Buffer): Sender {
    return new Sender(...GetterInstruction.deserializeBase(buf));
  }
}

export class Origin extends GetterInstruction {
  static type: string = 'ORIGIN';
  static readonly opcode: Opcode = Opcode.ORIGIN;

  protected get opcode() {
    return Origin.opcode;
  }
  protected getIt(env: AvmExecutionEnvironment): any {
    return env.origin;
  }
  public static deserialize(buf: BufferCursor | Buffer): Origin {
    return new Origin(...GetterInstruction.deserializeBase(buf));
  }
}

export class FeePerL1Gas extends GetterInstruction {
  static type: string = 'FEEPERL1GAS';
  static readonly opcode: Opcode = Opcode.FEEPERL1GAS;

  protected get opcode() {
    return FeePerL1Gas.opcode;
  }
  protected getIt(env: AvmExecutionEnvironment): any {
    return env.feePerL1Gas;
  }
  public static deserialize(buf: BufferCursor | Buffer): FeePerL1Gas {
    return new FeePerL1Gas(...GetterInstruction.deserializeBase(buf));
  }
}

export class FeePerL2Gas extends GetterInstruction {
  static type: string = 'FEEPERL2GAS';
  static readonly opcode: Opcode = Opcode.FEEPERL2GAS;

  protected get opcode() {
    return FeePerL2Gas.opcode;
  }
  protected getIt(env: AvmExecutionEnvironment): any {
    return env.feePerL2Gas;
  }
  public static deserialize(buf: BufferCursor | Buffer): FeePerL2Gas {
    return new FeePerL2Gas(...GetterInstruction.deserializeBase(buf));
  }
}

export class FeePerDAGas extends GetterInstruction {
  static type: string = 'FEEPERDAGAS';
  static readonly opcode: Opcode = Opcode.FEEPERDAGAS;

  protected get opcode() {
    return FeePerDAGas.opcode;
  }
  protected getIt(env: AvmExecutionEnvironment): any {
    return env.feePerDaGas;
  }
  public static deserialize(buf: BufferCursor | Buffer): FeePerDAGas {
    return new FeePerDAGas(...GetterInstruction.deserializeBase(buf));
  }
}

export class Portal extends GetterInstruction {
  static type: string = 'PORTAL';
  static readonly opcode: Opcode = Opcode.PORTAL;

  protected get opcode() {
    return Portal.opcode;
  }
  protected getIt(env: AvmExecutionEnvironment): any {
    return env.portal.toField();
  }
  public static deserialize(buf: BufferCursor | Buffer): Portal {
    return new Portal(...GetterInstruction.deserializeBase(buf));
  }
}

export class ChainId extends GetterInstruction {
  static type: string = 'CHAINID';
  static readonly opcode: Opcode = Opcode.CHAINID;

  protected get opcode() {
    return ChainId.opcode;
  }
  protected getIt(env: AvmExecutionEnvironment): any {
    return env.globals.chainId;
  }
  public static deserialize(buf: BufferCursor | Buffer): ChainId {
    return new ChainId(...GetterInstruction.deserializeBase(buf));
  }
}

export class Version extends GetterInstruction {
  static type: string = 'VERSION';
  static readonly opcode: Opcode = Opcode.VERSION;

  protected get opcode() {
    return Version.opcode;
  }
  protected getIt(env: AvmExecutionEnvironment): any {
    return env.globals.version;
  }
  public static deserialize(buf: BufferCursor | Buffer): Version {
    return new Version(...GetterInstruction.deserializeBase(buf));
  }
}

export class BlockNumber extends GetterInstruction {
  static type: string = 'BLOCKNUMBER';
  static readonly opcode: Opcode = Opcode.BLOCKNUMBER;

  protected get opcode() {
    return BlockNumber.opcode;
  }
  protected getIt(env: AvmExecutionEnvironment): any {
    return env.globals.blockNumber;
  }
  public static deserialize(buf: BufferCursor | Buffer): BlockNumber {
    return new BlockNumber(...GetterInstruction.deserializeBase(buf));
  }
}

export class Timestamp extends GetterInstruction {
  static type: string = 'TIMESTAMP';
  static readonly opcode: Opcode = Opcode.TIMESTAMP;

  protected get opcode() {
    return Timestamp.opcode;
  }
  protected getIt(env: AvmExecutionEnvironment): any {
    return env.globals.timestamp;
  }
  public static deserialize(buf: BufferCursor | Buffer): Timestamp {
    return new Timestamp(...GetterInstruction.deserializeBase(buf));
  }
}

// export class Coinbase extends GetterInstruction {
//     static type: string = 'COINBASE';
//     static numberOfOperands = 1;

//     constructor(private destOffset: number) {
//         super();
//     }

//     async execute(machineState: AvmMachineState, _journal: AvmJournal): Promise<void> {
//         const {coinbase} = machineState.executionEnvironment.globals;

//         machineState.memory.set(this.destOffset, coinbase);

//         this.incrementPc(machineState);
//     }
// }

// // TODO: are these even needed within the block? (both block gas limit variables - why does the execution env care?)
// export class BlockL1GasLimit extends GetterInstruction {
//     static type: string = 'BLOCKL1GASLIMIT';
//     static numberOfOperands = 1;

//     constructor(private destOffset: number) {
//         super();
//     }

//     async execute(machineState: AvmMachineState, _journal: AvmJournal): Promise<void> {
//         const {blockL1GasLimit} = machineState.executionEnvironment.globals;

//         machineState.memory.set(this.destOffset, blockL1GasLimit);

//         this.incrementPc(machineState);
//     }
// }

// export class BlockL2GasLimit extends GetterInstruction {
//     static type: string = 'BLOCKL2GASLIMIT';
//     static numberOfOperands = 1;

//     constructor(private destOffset: number) {
//         super();
//     }

//     async execute(machineState: AvmMachineState, _journal: AvmJournal): Promise<void> {
//         const {blockL2GasLimit} = machineState.executionEnvironment.globals;

//         machineState.memory.set(this.destOffset, blockL2GasLimit);

//         this.incrementPc(machineState);
//     }
// }

// export class BlockDAGasLimit extends GetterInstruction {
//     static type: string = 'BLOCKDAGASLIMIT';
//     static numberOfOperands = 1;

//     constructor(private destOffset: number) {
//         super();
//     }

//     async execute(machineState: AvmMachineState, _journal: AvmJournal): Promise<void> {
//         const {blockDAGasLimit} = machineState.executionEnvironment.globals;

//         machineState.memory.set(this.destOffset, blockDAGasLimit);

//         this.incrementPc(machineState);
//     }
// }
