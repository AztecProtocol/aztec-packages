import { type DebugLogger, createDebugLogger } from '@aztec/foundation/log';

import { strict as assert } from 'assert';

import type { AvmContext } from './avm_context.js';
import { AvmContractCallResults } from './avm_message_call_result.js';
import { AvmExecutionError, InvalidProgramCounterError, NoBytecodeForContractError } from './errors.js';
import type { Instruction } from './opcodes/index.js';
import { decodeFromBytecode } from './serialization/bytecode_serialization.js';

export class AvmSimulator {
  private log: DebugLogger;
  private logInstruction: DebugLogger;

  constructor(private context: AvmContext) {
    this.log = createDebugLogger(
      `aztec:avm_simulator:core(f:${context.environment.temporaryFunctionSelector.toString()})`,
    );
    this.logInstruction = createDebugLogger(
      `aztec:avm_simulator:core(f:${context.environment.temporaryFunctionSelector.toString()}):instruction`,
    );
  }

  /**
   * Fetch the bytecode and execute it in the current context.
   */
  public async execute(): Promise<AvmContractCallResults> {
    const selector = this.context.environment.temporaryFunctionSelector;
    const bytecode = await this.context.persistableState.hostStorage.contractsDb.getBytecode(
      this.context.environment.address,
      selector,
    );

    // This assumes that we will not be able to send messages to accounts without code
    // Pending classes and instances impl details
    if (!bytecode) {
      throw new NoBytecodeForContractError(this.context.environment.address);
    }

    return await this.executeBytecode(bytecode);
  }

  /**
   * Executes the provided bytecode in the current context.
   * This method is useful for testing and debugging.
   */
  public async executeBytecode(bytecode: Buffer): Promise<AvmContractCallResults> {
    return await this.executeInstructions(decodeFromBytecode(bytecode));
  }

  /**
   * Executes the provided instructions in the current context.
   * This method is useful for testing and debugging.
   */
  public async executeInstructions(instructions: Instruction[]): Promise<AvmContractCallResults> {
    assert(instructions.length > 0);
    // For stats only.
    let executedInstructions: bigint = 0n;
    const initialGas = {
      l1GasLeft: this.context.machineState.l1GasLeft,
      l2GasLeft: this.context.machineState.l2GasLeft,
      daGasLeft: this.context.machineState.daGasLeft,
    };
    const startingTime = Date.now();

    try {
      // Execute instruction pointed to by the current program counter
      // continuing until the machine state signifies a halt
      while (!this.context.machineState.halted) {
        const instruction = instructions[this.context.machineState.pc];
        assert(
          !!instruction,
          'AVM attempted to execute non-existent instruction. This should never happen (invalid bytecode or AVM simulator bug)!',
        );

        this.logInstruction(`@${this.context.machineState.pc} ${instruction.toString()}`);
        // Execute the instruction.
        // Normal returns and reverts will return normally here.
        // "Exceptional halts" will throw.
        await instruction.execute(this.context);
        executedInstructions++;

        if (this.context.machineState.pc >= instructions.length) {
          this.log('Passed end of program!');
          throw new InvalidProgramCounterError(this.context.machineState.pc, /*max=*/ instructions.length);
        }
      }

      // Return results for processing by calling context
      const results = this.context.machineState.getResults();
      this.log(`Context execution results: ${results.toString()}`);
      this.log(`Executed ${executedInstructions} instructions in ${Date.now() - startingTime}ms.`);
      this.log(
        `Gas consumed: { l1: ${initialGas.l1GasLeft - this.context.machineState.l1GasLeft}, l2: ${
          initialGas.l2GasLeft - this.context.machineState.l2GasLeft
        }, da: ${initialGas.daGasLeft - this.context.machineState.daGasLeft} }`,
      );
      return results;
    } catch (e) {
      this.log('Exceptional halt');
      if (!(e instanceof AvmExecutionError)) {
        this.log(`Unknown error thrown by avm: ${e}`);
        throw e;
      }

      // Return results for processing by calling context
      // Note: "exceptional halts" cannot return data
      const results = new AvmContractCallResults(/*reverted=*/ true, /*output=*/ [], /*revertReason=*/ e);
      this.log(`Context execution results: ${results.toString()}`);
      this.log(`Executed ${executedInstructions} instructions in ${Date.now() - startingTime}ms.`);
      this.log(
        `Gas consumed: { l1: ${initialGas.l1GasLeft - this.context.machineState.l1GasLeft}, l2: ${
          initialGas.l2GasLeft - this.context.machineState.l2GasLeft
        }, da: ${initialGas.daGasLeft - this.context.machineState.daGasLeft} }`,
      );
      return results;
    }
  }
}
