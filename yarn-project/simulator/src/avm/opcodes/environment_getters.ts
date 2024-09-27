import type { AvmContext } from '../avm_context.js';
import { Field, Uint32, Uint64 } from '../avm_memory_types.js';
import { Opcode, OperandType } from '../serialization/instruction_serialization.js';
import { Addressing } from './addressing_mode.js';
import { Instruction } from './instruction.js';

export enum EnvironmentVariable {
  ADDRESS,
  STORAGEADDRESS,
  SENDER,
  FUNCTIONSELECTOR,
  TRANSACTIONFEE,
  CHAINID,
  VERSION,
  BLOCKNUMBER,
  TIMESTAMP,
  FEEPERL2GAS,
  FEEPERDAGAS,
  ISSTATICCALL,
  L2GASLEFT,
  DAGASLEFT,
}

function getValue(e: EnvironmentVariable, ctx: AvmContext) {
  switch (e) {
    case EnvironmentVariable.ADDRESS:
      return new Field(ctx.environment.address.toField());
    case EnvironmentVariable.STORAGEADDRESS:
      return new Field(ctx.environment.storageAddress.toField());
    case EnvironmentVariable.SENDER:
      return new Field(ctx.environment.sender.toField());
    case EnvironmentVariable.FUNCTIONSELECTOR:
      return new Uint32(ctx.environment.functionSelector.value);
    case EnvironmentVariable.TRANSACTIONFEE:
      return new Field(ctx.environment.transactionFee);
    case EnvironmentVariable.CHAINID:
      return new Field(ctx.environment.globals.chainId);
    case EnvironmentVariable.VERSION:
      return new Field(ctx.environment.globals.version);
    case EnvironmentVariable.BLOCKNUMBER:
      return new Field(ctx.environment.globals.blockNumber);
    case EnvironmentVariable.TIMESTAMP:
      return new Uint64(ctx.environment.globals.timestamp.toBigInt());
    case EnvironmentVariable.FEEPERL2GAS:
      return new Field(ctx.environment.globals.gasFees.feePerL2Gas);
    case EnvironmentVariable.FEEPERDAGAS:
      return new Field(ctx.environment.globals.gasFees.feePerDaGas);
    case EnvironmentVariable.ISSTATICCALL:
      return new Field(ctx.environment.isStaticCall ? 1 : 0);
    case EnvironmentVariable.L2GASLEFT:
      return new Field(ctx.machineState.l2GasLeft);
    case EnvironmentVariable.DAGASLEFT:
      return new Field(ctx.machineState.daGasLeft);
    default:
      throw new Error(`Unknown environment variable ${e}`);
  }
}

export class GetEnvVar extends Instruction {
  public static readonly type: string = 'GETENVVAR';
  public static readonly opcode: Opcode = Opcode.GETENVVAR_16;
  static readonly wireFormat16: OperandType[] = [
    OperandType.UINT8, // opcode
    OperandType.UINT8, // indirect
    OperandType.UINT8, // variable enum (immediate)
    OperandType.UINT16, // dstOffset
  ];

  constructor(private indirect: number, private varEnum: EnvironmentVariable, private dstOffset: number) {
    super();
  }

  public async execute(context: AvmContext): Promise<void> {
    const memoryOperations = { writes: 1, indirect: this.indirect };
    const memory = context.machineState.memory.track(this.type);
    context.machineState.consumeGas(this.gasCost(memoryOperations));

    const [dstOffset] = Addressing.fromWire(this.indirect).resolve([this.dstOffset], memory);

    memory.set(dstOffset, getValue(this.varEnum, context));

    memory.assert(memoryOperations);
    context.machineState.incrementPc();
  }
}
