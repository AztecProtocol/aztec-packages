import { MAX_L2_GAS_PER_ENQUEUED_CALL } from '@aztec/circuits.js';
import { type DebugLogger, createDebugLogger } from '@aztec/foundation/log';

import { strict as assert } from 'assert';

import { SideEffectLimitReachedError } from '../public/side_effect_errors.js';
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

export class AvmSimulator {
  private log: DebugLogger;
  private bytecode: Buffer | undefined;

  constructor(private context: AvmContext) {
    assert(
      context.machineState.gasLeft.l2Gas <= MAX_L2_GAS_PER_ENQUEUED_CALL,
      `Cannot allocate more than ${MAX_L2_GAS_PER_ENQUEUED_CALL} to the AVM for execution of an enqueued call`,
    );
    this.log = createDebugLogger(`aztec:avm_simulator:core(f:${context.environment.functionSelector.toString()})`);
  }

  /**
   * Fetch the bytecode and execute it in the current context.
   */
  public async execute(): Promise<AvmContractCallResult> {
    const bytecode = await this.context.persistableState.getBytecode(
      this.context.environment.address,
      this.context.environment.functionSelector,
    );

    // This assumes that we will not be able to send messages to accounts without code
    // Pending classes and instances impl details
    if (!bytecode) {
      throw new NoBytecodeForContractError(this.context.environment.address);
    }

    return await this.executeBytecode(bytecode);
  }

  /**
   * Return the bytecode used for execution, if any.
   */
  public getBytecode(): Buffer | undefined {
    return this.bytecode;
  }

  /**
   * Executes the provided bytecode in the current context.
   * This method is useful for testing and debugging.
   */
  public async executeBytecode(bytecode: Buffer): Promise<AvmContractCallResult> {
    assert(isAvmBytecode(bytecode), "AVM simulator can't execute non-AVM bytecode");

    this.bytecode = bytecode;
    return await this.executeInstructions(decodeFromBytecode(bytecode));
  }

  /**
   * Executes the provided instructions in the current context.
   * This method is useful for testing and debugging.
   */
  public async executeInstructions(instructions: Instruction[]): Promise<AvmContractCallResult> {
    assert(instructions.length > 0);
    const { machineState } = this.context;
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
        await instruction.execute(this.context);

        if (machineState.pc >= instructions.length) {
          this.log.warn('Passed end of program');
          throw new InvalidProgramCounterError(machineState.pc, /*max=*/ instructions.length);
        }
      }

      const output = machineState.getOutput();
      const reverted = machineState.getReverted();
      const revertReason = reverted ? revertReasonFromExplicitRevert(output, this.context) : undefined;
      const results = new AvmContractCallResult(reverted, output, revertReason);
      this.log.debug(`Context execution results: ${results.toString()}`);
      // Return results for processing by calling context
      return results;
    } catch (err: any) {
      this.log.verbose('Exceptional halt (revert by something other than REVERT opcode)');
      if (!(err instanceof AvmExecutionError || err instanceof SideEffectLimitReachedError)) {
        this.log.verbose(`Unknown error thrown by AVM: ${err}`);
        throw err;
      }

      const revertReason = revertReasonFromExceptionalHalt(err, this.context);
      // Note: "exceptional halts" cannot return data, hence []
      const results = new AvmContractCallResult(/*reverted=*/ true, /*output=*/ [], revertReason);
      this.log.debug(`Context execution results: ${results.toString()}`);
      // Return results for processing by calling context
      return results;
    }
  }
}
