import { Fr } from '@aztec/foundation/fields';

import type { AvmContext } from '../avm_context.js';
import { Field } from '../avm_memory_types.js';
import { AvmSimulator } from '../avm_simulator.js';
import { Opcode, OperandType } from '../serialization/instruction_serialization.js';
import { Instruction } from './instruction.js';
import { FunctionSelector } from '@aztec/circuits.js';
import { createConsoleLogger } from '@aztec/foundation/log';

export class Call extends Instruction {
  static type: string = 'CALL';
  static readonly opcode: Opcode = Opcode.CALL;
  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT64, //!!
    OperandType.UINT32,
    OperandType.UINT64, //!!
    OperandType.UINT32,
    OperandType.UINT64, //!!
    OperandType.UINT32,
    OperandType.UINT32,
    /* temporary function selector */
    OperandType.UINT32,
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
    // Function selector is temporary since eventually public contract bytecode will be one blob
    // containing all functions, and function selector will become an application-level mechanism
    // (e.g. first few bytes of calldata + compiler-generated jump table)
    private temporaryFunctionSelectorOffset: number,
  ) {
    super();
  }

  // TODO(https://github.com/AztecProtocol/aztec-packages/issues/3992): there is no concept of remaining / available gas at this moment
  async execute(context: AvmContext): Promise<void> {
    const callAddress = context.machineState.memory.getAs<Field>(this.addrOffset);
    // "valueOf()" only necessary while argsOffset is u64
    console.log(`typeof argsOffset: ${typeof this.argsOffset}`);
    const calldata = context.machineState.memory.getSlice(Number(this.argsOffset), this.argsSize).map(f => f.toFr());
    const functionSelector = context.machineState.memory.getAs<Field>(this.temporaryFunctionSelectorOffset).toFr();

    const nestedContext = context.createNestedContractCallContext(callAddress.toFr(), calldata, FunctionSelector.fromField(functionSelector));

    const nestedCallResults = await new AvmSimulator(nestedContext).execute();
    const success = !nestedCallResults.reverted;

    // We only take as much data as was specified in the return size -> TODO: should we be reverting here
    const returnData = nestedCallResults.output.slice(0, this.retSize);
    const convertedReturnData = returnData.map(f => new Field(f));

    // Write our return data into memory
    context.machineState.memory.set(this.successOffset, new Field(success ? 1 : 0));
    context.machineState.memory.setSlice(Number(this.retOffset), convertedReturnData);

    if (success) {
      context.persistableState.acceptNestedCallState(nestedContext.persistableState);
    } else {
      context.persistableState.rejectNestedCallState(nestedContext.persistableState);
    }

    context.machineState.incrementPc();
  }
}

export class StaticCall extends Instruction {
  static type: string = 'STATICCALL';
  static readonly opcode: Opcode = Opcode.STATICCALL;
  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT64, //!!
    OperandType.UINT32,
    OperandType.UINT64, //!!
    OperandType.UINT32,
    OperandType.UINT64, //!!
    OperandType.UINT32,
    OperandType.UINT32,
    /* temporary function selector */
    OperandType.UINT32,
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
    private temporaryFunctionSelectorOffset: number,
  ) {
    super();
  }

  async execute(context: AvmContext): Promise<void> {
    const callAddress = context.machineState.memory.get(this.addrOffset);
    // "valueOf()" only necessary while argsOffset is u64
    const calldata = context.machineState.memory.getSlice(Number(this.argsOffset), this.argsSize).map(f => f.toFr());
    const functionSelector = context.machineState.memory.getAs<Field>(this.temporaryFunctionSelectorOffset).toFr();

    const nestedContext = context.createNestedContractStaticCallContext(callAddress.toFr(), calldata, FunctionSelector.fromField(functionSelector));

    const nestedCallResults = await new AvmSimulator(nestedContext).execute();
    const success = !nestedCallResults.reverted;

    // We only take as much data as was specified in the return size -> TODO: should we be reverting here
    const returnData = nestedCallResults.output.slice(0, this.retSize);
    const convertedReturnData = returnData.map(f => new Field(f));

    // Write our return data into memory
    context.machineState.memory.set(this.successOffset, new Field(success ? 1 : 0));
    context.machineState.memory.setSlice(Number(this.retOffset), convertedReturnData);

    if (success) {
      context.persistableState.acceptNestedCallState(nestedContext.persistableState);
    } else {
      context.persistableState.rejectNestedCallState(nestedContext.persistableState);
    }

    context.machineState.incrementPc();
  }
}
