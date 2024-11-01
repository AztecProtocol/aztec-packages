import { MAX_L2_GAS_PER_ENQUEUED_CALL } from '@aztec/circuits.js';
import { type DebugLogger, createDebugLogger } from '@aztec/foundation/log';

import { strict as assert } from 'assert';

import { SideEffectLimitReachedError } from '../public/side_effect_errors.js';
import type { AvmContext } from './avm_context.js';
import { AvmContractCallResult } from './avm_contract_call_result.js';
import { type Gas } from './avm_gas.js';
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

type OpcodeTally = {
  count: number;
  gas: Gas;
};
type PcTally = {
  opcode: string;
  count: number;
  gas: Gas;
};

export class AvmSimulator {
  private log: DebugLogger;
  private bytecode: Buffer | undefined;
  public opcodeTallies: Map<string, OpcodeTally> = new Map();
  public pcTallies: Map<number, PcTally> = new Map();

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
    const bytecode = await this.context.persistableState.getBytecode(this.context.environment.address);

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
      let instrCounter = 0;
      while (!machineState.getHalted()) {
        const instruction = instructions[machineState.pc];
        assert(
          !!instruction,
          'AVM attempted to execute non-existent instruction. This should never happen (invalid bytecode or AVM simulator bug)!',
        );

        const instrStartGas = machineState.gasLeft; // Save gas before executing instruction (for profiling)
        const instrPc = machineState.pc; // Save PC before executing instruction (for profiling)

        this.log.debug(
          `[PC:${machineState.pc}] [IC:${instrCounter++}] ${instruction.toString()} (gasLeft l2=${
            machineState.l2GasLeft
          } da=${machineState.daGasLeft})`,
        );
        // Execute the instruction.
        // Normal returns and reverts will return normally here.
        // "Exceptional halts" will throw.
        await instruction.execute(this.context);

        // gas used by this instruction - used for profiling/tallying
        const gasUsed: Gas = {
          l2Gas: instrStartGas.l2Gas - machineState.l2GasLeft,
          daGas: instrStartGas.daGas - machineState.daGasLeft,
        };
        this.tallyInstruction(instrPc, instruction.constructor.name, gasUsed);

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

      this.printOpcodeTallies();
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

      this.printOpcodeTallies();
      // Return results for processing by calling context
      return results;
    }
  }

  private tallyInstruction(pc: number, opcode: string, gasUsed: Gas) {
    const opcodeTally = this.opcodeTallies.get(opcode) || ({ count: 0, gas: { l2Gas: 0, daGas: 0 } } as OpcodeTally);
    opcodeTally.count++;
    opcodeTally.gas.l2Gas += gasUsed.l2Gas;
    opcodeTally.gas.daGas += gasUsed.daGas;
    this.opcodeTallies.set(opcode, opcodeTally);

    const pcTally = this.pcTallies.get(pc) || ({ opcode: opcode, count: 0, gas: { l2Gas: 0, daGas: 0 } } as PcTally);
    pcTally.count++;
    pcTally.gas.l2Gas += gasUsed.l2Gas;
    pcTally.gas.daGas += gasUsed.daGas;
    this.pcTallies.set(pc, pcTally);
  }

  private printOpcodeTallies() {
    this.log.debug(`Printing tallies per opcode sorted by gas...`);
    // sort descending by L2 gas consumed
    const sortedOpcodes = Array.from(this.opcodeTallies.entries()).sort((a, b) => b[1].gas.l2Gas - a[1].gas.l2Gas);
    for (const [opcode, tally] of sortedOpcodes) {
      // NOTE: don't care to clutter the logs with DA gas for now
      this.log.debug(`${opcode} executed ${tally.count} times consuming a total of ${tally.gas.l2Gas} L2 gas`);
    }

    this.log.debug(`Printing tallies per PC sorted by #times each PC was executed...`);
    const sortedPcs = Array.from(this.pcTallies.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .filter((_, i) => i < 20);
    for (const [pc, tally] of sortedPcs) {
      // NOTE: don't care to clutter the logs with DA gas for now
      this.log.debug(
        `PC:${pc} containing opcode ${tally.opcode} executed ${tally.count} times consuming a total of ${tally.gas.l2Gas} L2 gas`,
      );
    }
  }
}
