import { type DebugLogger, createDebugLogger } from '@aztec/foundation/log';

import { strict as assert } from 'assert';

import type { AvmContext } from './avm_context.js';
import { AvmContractCallResult } from './avm_contract_call_result.js';
import { isAvmBytecode } from './bytecode_utils.js';
import {
  AvmExecutionError,
  InvalidProgramCounterError,
  NoBytecodeForContractError,
  revertReasonFromExceptionalHalt,
  revertReasonFromExplicitRevert,
} from './errors.js';
import type { Instruction } from './opcodes/index.js';
import { decodeFromBytecode } from './serialization/bytecode_serialization.js';
import { AztecAddress } from '@aztec/circuits.js';

export class AvmSimulator {
  private log: DebugLogger;
  private bytecodes: Map<AztecAddress, Buffer> = new Map();

  //constructor(private context: AvmContext) {
  constructor() {
    //this.log = createDebugLogger(`aztec:avm_simulator:core(f:${context.environment.functionSelector.toString()})`);
    this.log = createDebugLogger(`aztec:avm_simulator:core`);
  }

  /**
   * Fetch the bytecode and execute it in the current context.
   */
  public async execute(context: AvmContext): Promise<AvmContractCallResult> {
    const bytecode = await context.persistableState.getBytecode(
      context.environment.address,
      context.environment.functionSelector,
    );

    // This assumes that we will not be able to send messages to accounts without code
    // Pending classes and instances impl details
    if (!bytecode) {
      throw new NoBytecodeForContractError(context.environment.address);
    }

    this.bytecodes.set(context.environment.address, bytecode);

    return await this.executeBytecode(context, bytecode);
  }

  /**
   * Return the bytecode used for execution, if any.
   */
  public getBytecode(address: AztecAddress): Buffer | undefined {
    return this.bytecodes.get(address);
  }

  /**
   * Executes the provided bytecode in the current context.
   * This method is useful for testing and debugging.
   */
  public async executeBytecode(context: AvmContext, bytecode: Buffer): Promise<AvmContractCallResult> {
    assert(isAvmBytecode(bytecode), "AVM simulator can't execute non-AVM bytecode");

    return await this.executeInstructions(context, decodeFromBytecode(bytecode));
  }

  /**
   * Executes the provided instructions in the current context.
   * This method is useful for testing and debugging.
   */
  public async executeInstructions(context: AvmContext, instructions: Instruction[]): Promise<AvmContractCallResult> {
    assert(instructions.length > 0);
    const { machineState } = context;
    try {
      // Execute instruction pointed to by the current program counter
      // continuing until the machine state signifies a halt
      while (!machineState.getHalted()) {
        const instruction = instructions[machineState.pc];
        assert(
          !!instruction,
          'AVM attempted to execute non-existent instruction. This should never happen (invalid bytecode or AVM simulator bug)!',
        );

        const gasLeft = `l2=${machineState.l2GasLeft} da=${machineState.daGasLeft}`;
        this.log.debug(`@${machineState.pc} ${instruction.toString()} (${gasLeft})`);
        // Execute the instruction.
        // Normal returns and reverts will return normally here.
        // "Exceptional halts" will throw.
        await instruction.execute(context, this.execute, this.getBytecode);

        if (machineState.pc >= instructions.length) {
          this.log.warn('Passed end of program');
          throw new InvalidProgramCounterError(machineState.pc, /*max=*/ instructions.length);
        }
      }

      const output = machineState.getOutput();
      const reverted = machineState.getReverted();
      const revertReason = reverted ? revertReasonFromExplicitRevert(output, context) : undefined;
      const results = new AvmContractCallResult(reverted, output, revertReason);
      this.log.debug(`Context execution results: ${results.toString()}`);
      // Return results for processing by calling context
      return results;
    } catch (err: any) {
      this.log.verbose('Exceptional halt (revert by something other than REVERT opcode)');
      if (!(err instanceof AvmExecutionError)) {
        this.log.verbose(`Unknown error thrown by AVM: ${err}`);
        throw err;
      }

      const revertReason = revertReasonFromExceptionalHalt(err, context);
      // Note: "exceptional halts" cannot return data, hence []
      const results = new AvmContractCallResult(/*reverted=*/ true, /*output=*/ [], revertReason);
      this.log.debug(`Context execution results: ${results.toString()}`);
      // Return results for processing by calling context
      return results;
    }
  }
}
