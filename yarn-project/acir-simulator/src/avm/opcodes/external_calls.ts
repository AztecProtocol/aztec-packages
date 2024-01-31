import { Fr } from '@aztec/foundation/fields';

import { AvmContext } from '../avm_context.js';
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

export class Call extends Instruction {
  static type: string = 'CALL';
  static readonly opcode: Opcode = Opcode.CALL;

  // Instruction wire format with opcode.
  private static readonly wireFormat: OperandPair[] = [
    [(_: Call) => Call.opcode, OperandType.UINT8],
    [(c: Call) => c.indirect, OperandType.UINT8],
    [(c: Call) => c._gasOffset, OperandType.UINT32],
    [(c: Call) => c.addrOffset, OperandType.UINT32],
    [(c: Call) => c.argsOffset, OperandType.UINT32],
    [(c: Call) => c.argsSize, OperandType.UINT32],
    [(c: Call) => c.retOffset, OperandType.UINT32],
    [(c: Call) => c.retSize, OperandType.UINT32],
    [(c: Call) => c.successOffset, OperandType.UINT32],
  ];

  constructor(
    private indirect: number,
    private _gasOffset: number /* Unused due to no formal gas implementation at this moment */,
    private addrOffset: number,
    private argsOffset: number,
    private argsSize: number,
    private retOffset: number,
    private retSize: number,
    private successOffset: number,
  ) {
    super();
  }

  public static deserialize(buf: BufferCursor | Buffer): Call {
    const res = deserialize(buf, Call.wireFormat);
    const args = res.slice(1) as ConstructorParameters<typeof Call>; // Remove opcode.
    return new Call(...args);
  }

  public serialize(): Buffer {
    return serialize(Call.wireFormat, this);
  }

  // TODO(https://github.com/AztecProtocol/aztec-packages/issues/3992): there is no concept of remaining / available gas at this moment
  async execute(machineState: AvmMachineState, journal: AvmJournal): Promise<void> {
    const callAddress = machineState.memory.getAs<Field>(this.addrOffset);
    const calldata = machineState.memory.getSlice(this.argsOffset, this.argsSize).map(f => new Fr(f.toBigInt()));

    const avmContext = AvmContext.prepExternalCallContext(
      new Fr(callAddress.toBigInt()),
      calldata,
      machineState.executionEnvironment,
      journal,
    );

    const returnObject = await avmContext.call();
    const success = !returnObject.reverted;

    // We only take as much data as was specified in the return size -> TODO: should we be reverting here
    const returnData = returnObject.output.slice(0, this.retSize);
    const convertedReturnData = returnData.map(f => new Field(f));

    // Write our return data into memory
    machineState.memory.set(this.successOffset, new Field(success ? 1 : 0));
    machineState.memory.setSlice(this.retOffset, convertedReturnData);

    if (success) {
      avmContext.mergeJournal();
    }

    this.incrementPc(machineState);
  }
}

export class StaticCall extends Instruction {
  static type: string = 'STATICCALL';
  static readonly opcode: Opcode = Opcode.STATICCALL;

  // Instruction wire format with opcode.
  private static readonly wireFormat: OperandPair[] = [
    [(_: StaticCall) => StaticCall.opcode, OperandType.UINT8],
    [(c: StaticCall) => c.indirect, OperandType.UINT8],
    [(c: StaticCall) => c._gasOffset, OperandType.UINT32],
    [(c: StaticCall) => c.addrOffset, OperandType.UINT32],
    [(c: StaticCall) => c.argsOffset, OperandType.UINT32],
    [(c: StaticCall) => c.argsSize, OperandType.UINT32],
    [(c: StaticCall) => c.retOffset, OperandType.UINT32],
    [(c: StaticCall) => c.retSize, OperandType.UINT32],
    [(c: StaticCall) => c.successOffset, OperandType.UINT32],
  ];

  constructor(
    private indirect: number,
    private _gasOffset: number /* Unused due to no formal gas implementation at this moment */,
    private addrOffset: number,
    private argsOffset: number,
    private argsSize: number,
    private retOffset: number,
    private retSize: number,
    private successOffset: number,
  ) {
    super();
  }

  public static deserialize(buf: BufferCursor | Buffer): StaticCall {
    const res = deserialize(buf, StaticCall.wireFormat);
    const args = res.slice(1) as ConstructorParameters<typeof StaticCall>; // Remove opcode.
    return new StaticCall(...args);
  }

  public serialize(): Buffer {
    return serialize(StaticCall.wireFormat, this);
  }

  async execute(machineState: AvmMachineState, journal: AvmJournal): Promise<void> {
    const callAddress = machineState.memory.get(this.addrOffset);
    const calldata = machineState.memory.getSlice(this.argsOffset, this.argsSize).map(f => new Fr(f.toBigInt()));

    const avmContext = AvmContext.prepExternalStaticCallContext(
      new Fr(callAddress.toBigInt()),
      calldata,
      machineState.executionEnvironment,
      journal,
    );

    const returnObject = await avmContext.call();
    const success = !returnObject.reverted;

    // We only take as much data as was specified in the return size -> TODO: should we be reverting here
    const returnData = returnObject.output.slice(0, this.retSize);
    const convertedReturnData = returnData.map(f => new Field(f));

    // Write our return data into memory
    machineState.memory.set(this.successOffset, new Field(success ? 1 : 0));
    machineState.memory.setSlice(this.retOffset, convertedReturnData);

    if (success) {
      avmContext.mergeJournal();
    }

    this.incrementPc(machineState);
  }
}
