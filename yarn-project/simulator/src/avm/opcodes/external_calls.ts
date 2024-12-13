import type { AvmContext } from '../avm_context.js';
import { type AvmContractCallResult } from '../avm_contract_call_result.js';
import { type Field, TypeTag, Uint1 } from '../avm_memory_types.js';
import { AvmSimulator } from '../avm_simulator.js';
import { Opcode, OperandType } from '../serialization/instruction_serialization.js';
import { Addressing } from './addressing_mode.js';
import { Instruction } from './instruction.js';

abstract class ExternalCall extends Instruction {
  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT16, // Indirect
    OperandType.UINT16,
    OperandType.UINT16,
    OperandType.UINT16,
    OperandType.UINT16,
    OperandType.UINT16,
  ];

  constructor(
    private indirect: number,
    private gasOffset: number,
    private addrOffset: number,
    private argsOffset: number,
    private argsSizeOffset: number,
    private successOffset: number,
  ) {
    super();
  }

  public async execute(context: AvmContext) {
    const memory = context.machineState.memory.track(this.type);
    const operands = [this.gasOffset, this.addrOffset, this.argsOffset, this.argsSizeOffset, this.successOffset];
    const addressing = Addressing.fromWire(this.indirect, operands.length);
    const [gasOffset, addrOffset, argsOffset, argsSizeOffset, successOffset] = addressing.resolve(operands, memory);
    memory.checkTags(TypeTag.FIELD, gasOffset, gasOffset + 1);
    memory.checkTag(TypeTag.FIELD, addrOffset);
    memory.checkTag(TypeTag.UINT32, argsSizeOffset);

    const calldataSize = memory.get(argsSizeOffset).toNumber();
    memory.checkTagsRange(TypeTag.FIELD, argsOffset, calldataSize);

    const callAddress = memory.getAs<Field>(addrOffset);
    const calldata = memory.getSlice(argsOffset, calldataSize).map(f => f.toFr());
    // If we are already in a static call, we propagate the environment.
    const callType = context.environment.isStaticCall ? 'STATICCALL' : this.type;

    // First we consume the gas for this operation.
    context.machineState.consumeGas(this.gasCost(calldataSize));
    // Then we consume the gas allocated for the nested call. The excess will be refunded later.
    // Gas allocation is capped by the amount of gas left in the current context.
    // We have to do some dancing here because the gas allocation is a field,
    // but in the machine state we track gas as a number.
    const allocatedL2Gas = Number(BigIntMin(memory.get(gasOffset).toBigInt(), BigInt(context.machineState.l2GasLeft)));
    const allocatedDaGas = Number(
      BigIntMin(memory.get(gasOffset + 1).toBigInt(), BigInt(context.machineState.daGasLeft)),
    );
    console.log('allocatedL2Gas', allocatedL2Gas);
    console.log('allocatedDaGas', allocatedDaGas);
    const allocatedGas = { l2Gas: allocatedL2Gas, daGas: allocatedDaGas };
    context.machineState.consumeGas(allocatedGas);

    const aztecAddress = callAddress.toAztecAddress();
    const nestedContext = context.createNestedContractCallContext(aztecAddress, calldata, allocatedGas, callType);

    const simulator = await AvmSimulator.build(nestedContext);
    const nestedCallResults: AvmContractCallResult = await simulator.execute();
    const success = !nestedCallResults.reverted;

    // Save return/revert data for later.
    const fullReturnData = nestedCallResults.output;
    context.machineState.nestedReturndata = fullReturnData;

    // If the nested call reverted, we try to save the reason and the revert data.
    // This will be used by the caller to try to reconstruct the call stack.
    // This is only a heuristic and may not always work. It is intended to work
    // for the case where a nested call reverts and the caller always rethrows
    // (in Noir code).
    if (!success) {
      context.machineState.collectedRevertInfo = {
        revertDataRepresentative: fullReturnData,
        recursiveRevertReason: nestedCallResults.revertReason!,
      };
    }

    // Write our success flag into memory.
    memory.set(successOffset, new Uint1(success ? 1 : 0));

    // Refund unused gas
    context.machineState.refundGas(nestedCallResults.gasLeft);

    // Merge nested call's state and trace based on whether it succeeded.
    if (success) {
      context.persistableState.merge(nestedContext.persistableState);
    } else {
      context.persistableState.reject(nestedContext.persistableState);
    }
    memory.assert({ reads: calldataSize + 4, writes: 1, addressing });
  }

  public abstract override get type(): 'CALL' | 'STATICCALL';
}

export class Call extends ExternalCall {
  static type = 'CALL' as const;
  static readonly opcode: Opcode = Opcode.CALL;

  public get type() {
    return Call.type;
  }
}

export class StaticCall extends ExternalCall {
  static type = 'STATICCALL' as const;
  static readonly opcode: Opcode = Opcode.STATICCALL;

  public get type() {
    return StaticCall.type;
  }
}

export class Return extends Instruction {
  static type: string = 'RETURN';
  static readonly opcode: Opcode = Opcode.RETURN;
  // Informs (de)serialization. See Instruction.deserialize.
  static readonly wireFormat: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT16,
    OperandType.UINT16,
  ];

  constructor(private indirect: number, private returnOffset: number, private returnSizeOffset: number) {
    super();
  }

  public async execute(context: AvmContext): Promise<void> {
    const memory = context.machineState.memory.track(this.type);

    const operands = [this.returnOffset, this.returnSizeOffset];
    const addressing = Addressing.fromWire(this.indirect, operands.length);
    const [returnOffset, returnSizeOffset] = addressing.resolve(operands, memory);

    memory.checkTag(TypeTag.UINT32, returnSizeOffset);
    const returnSize = memory.get(returnSizeOffset).toNumber();
    context.machineState.consumeGas(this.gasCost(returnSize));

    const output = memory.getSlice(returnOffset, returnSize).map(word => word.toFr());

    context.machineState.return(output);
    memory.assert({ reads: returnSize + 1, addressing });
  }

  public override handlesPC(): boolean {
    return true;
  }
}

export class Revert extends Instruction {
  static type: string = 'REVERT';
  static readonly opcode: Opcode = Opcode.REVERT_8;

  static readonly wireFormat8: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT8,
  ];
  static readonly wireFormat16: OperandType[] = [
    OperandType.UINT8,
    OperandType.UINT8,
    OperandType.UINT16,
    OperandType.UINT16,
  ];

  constructor(private indirect: number, private returnOffset: number, private retSizeOffset: number) {
    super();
  }

  public async execute(context: AvmContext): Promise<void> {
    const memory = context.machineState.memory.track(this.type);

    const operands = [this.returnOffset, this.retSizeOffset];
    const addressing = Addressing.fromWire(this.indirect, operands.length);
    const [returnOffset, retSizeOffset] = addressing.resolve(operands, memory);

    memory.checkTag(TypeTag.UINT32, retSizeOffset);
    const retSize = memory.get(retSizeOffset).toNumber();
    context.machineState.consumeGas(this.gasCost(retSize));
    const output = memory.getSlice(returnOffset, retSize).map(word => word.toFr());

    context.machineState.revert(output);
    memory.assert({ reads: retSize + 1, addressing });
  }

  // We don't want to increase the PC after reverting because it breaks messages.
  // Maybe we can remove this once messages don't depend on PCs.
  public override handlesPC(): boolean {
    return true;
  }
}

/** Returns the smaller of two bigints. */
function BigIntMin(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}
