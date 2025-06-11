import type { AvmContext } from '../avm_context.js';
import { Field, Uint64, Uint128 } from '../avm_memory_types.js';
import { InstructionExecutionError } from '../errors.js';
import { Opcode, OperandType } from '../serialization/instruction_serialization.js';
import { Addressing } from './addressing_mode.js';
import { Instruction } from './instruction.js';

export enum EnvironmentVariable {
  ADDRESS,
  SENDER,
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
    case EnvironmentVariable.SENDER:
      return new Field(ctx.environment.sender.toField());
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
      return new Uint128(ctx.environment.globals.gasFees.feePerL2Gas);
    case EnvironmentVariable.FEEPERDAGAS:
      return new Uint128(ctx.environment.globals.gasFees.feePerDaGas);
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
    OperandType.UINT16, // dstOffset
    OperandType.UINT8, // variable enum (immediate)
  ];

  constructor(
    private indirect: number,
    private dstOffset: number,
    private varEnum: number,
  ) {
    super();
  }

  public async execute(context: AvmContext): Promise<void> {
    const memory = context.machineState.memory;
    const addressing = Addressing.fromWire(this.indirect);

    context.machineState.consumeGas(
      this.baseGasCost(addressing.indirectOperandsCount(), addressing.relativeOperandsCount()),
    );

    if (!(this.varEnum in EnvironmentVariable)) {
      throw new InstructionExecutionError(`Invalid GETENVVAR var enum ${this.varEnum}`);
    }

    const operands = [this.dstOffset];
    const [dstOffset] = addressing.resolve(operands, memory);

    memory.set(dstOffset, getValue(this.varEnum as EnvironmentVariable, context));
  }
}
