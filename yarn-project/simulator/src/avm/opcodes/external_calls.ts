import { FunctionSelector } from '@aztec/circuits.js';

import type { AvmContext } from '../avm_context.js';
import { type Gas, addGas, gasLeftToGas, getCostFromIndirectAccess, getFixedGasCost } from '../avm_gas.js';
import { Field, Uint8 } from '../avm_memory_types.js';
import { AvmSimulator } from '../avm_simulator.js';
import { Opcode, OperandType } from '../serialization/instruction_serialization.js';
import { Addressing } from './addressing_mode.js';
import { Instruction } from './instruction.js';

abstract class ExternalCall extends Instruction {
  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT32,
    OperandType.UINT32,
    OperandType.UINT32,
    OperandType.UINT32,
    OperandType.UINT32,
    OperandType.UINT32,
    OperandType.UINT32,
    /* temporary function selector */
    OperandType.UINT32,
  ];

  constructor(
    private indirect: number,
    private gasOffset: number /* Unused due to no formal gas implementation at this moment */,
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

  async run(context: AvmContext): Promise<void> {
    const [gasOffset, addrOffset, argsOffset, retOffset, successOffset] = Addressing.fromWire(this.indirect).resolve(
      [this.gasOffset, this.addrOffset, this.argsOffset, this.retOffset, this.successOffset],
      context.machineState.memory,
    );

    const callAddress = context.machineState.memory.getAs<Field>(addrOffset);
    const calldata = context.machineState.memory.getSlice(argsOffset, this.argsSize).map(f => f.toFr());
    const l1Gas = context.machineState.memory.getAs<Field>(gasOffset).toNumber();
    const l2Gas = context.machineState.memory.getAs<Field>(gasOffset + 1).toNumber();
    const daGas = context.machineState.memory.getAs<Field>(gasOffset + 2).toNumber();
    const functionSelector = context.machineState.memory.getAs<Field>(this.temporaryFunctionSelectorOffset).toFr();

    // Consume a base fixed gas cost for the call opcode, plus whatever is allocated for the nested call
    const baseGas = getFixedGasCost(this.opcode);
    const addressingGasCost = getCostFromIndirectAccess(this.indirect);
    const allocatedGas = { l1Gas, l2Gas, daGas };
    context.machineState.consumeGas(addGas(baseGas, addressingGasCost, allocatedGas));

    const nestedContext = context.createNestedContractCallContext(
      callAddress.toFr(),
      calldata,
      allocatedGas,
      this.type,
      FunctionSelector.fromField(functionSelector),
    );

    const nestedCallResults = await new AvmSimulator(nestedContext).execute();
    const success = !nestedCallResults.reverted;

    // We only take as much data as was specified in the return size -> TODO: should we be reverting here
    const returnData = nestedCallResults.output.slice(0, this.retSize);
    const convertedReturnData = returnData.map(f => new Field(f));

    // Write our return data into memory
    context.machineState.memory.set(successOffset, new Uint8(success ? 1 : 0));
    context.machineState.memory.setSlice(retOffset, convertedReturnData);

    // Refund unused gas
    context.machineState.refundGas(gasLeftToGas(nestedContext.machineState));

    // TODO: Should we merge the changes from a nested call in the case of a STATIC call?
    if (success) {
      context.persistableState.acceptNestedCallState(nestedContext.persistableState);
    } else {
      context.persistableState.rejectNestedCallState(nestedContext.persistableState);
    }

    context.machineState.incrementPc();
  }

  public get type(): 'CALL' | 'STATICCALL' {
    const type = super.type;
    if (type !== 'CALL' && type !== 'STATICCALL') {
      throw new Error(`Invalid type for ExternalCall instruction: ${type}`);
    }
    return type;
  }

  protected execute(_context: AvmContext): Promise<void> {
    throw new Error(`Unimplemented`);
  }

  protected gasCost(): Gas {
    throw new Error(`Unimplemented`);
  }
}

export class Call extends ExternalCall {
  static type: string = 'CALL';
  static readonly opcode: Opcode = Opcode.CALL;
}

export class StaticCall extends ExternalCall {
  static type: string = 'STATICCALL';
  static readonly opcode: Opcode = Opcode.STATICCALL;
}

export class Return extends Instruction {
  static type: string = 'RETURN';
  static readonly opcode: Opcode = Opcode.RETURN;
  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT32,
    OperandType.UINT32,
  ];

  constructor(private indirect: number, private returnOffset: number, private copySize: number) {
    super();
  }

  async execute(context: AvmContext): Promise<void> {
    const [returnOffset] = Addressing.fromWire(this.indirect).resolve([this.returnOffset], context.machineState.memory);

    const output = context.machineState.memory.getSlice(returnOffset, this.copySize).map(word => word.toFr());

    context.machineState.return(output);
  }
}

export class Revert extends Instruction {
  static type: string = 'REVERT';
  static readonly opcode: Opcode = Opcode.REVERT;
  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT32,
    OperandType.UINT32,
  ];

  constructor(private indirect: number, private returnOffset: number, private retSize: number) {
    super();
  }

  async execute(context: AvmContext): Promise<void> {
    const [returnOffset] = Addressing.fromWire(this.indirect).resolve([this.returnOffset], context.machineState.memory);

    const output = context.machineState.memory.getSlice(returnOffset, this.retSize).map(word => word.toFr());

    context.machineState.revert(output);
  }
}
