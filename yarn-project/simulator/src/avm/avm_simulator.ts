import {
  type AztecAddress,
  Fr,
  type FunctionSelector,
  type GlobalVariables,
  MAX_L2_GAS_PER_ENQUEUED_CALL,
} from '@aztec/circuits.js';
import { type DebugLogger, createDebugLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';

import { strict as assert } from 'assert';

import { SideEffectLimitReachedError } from '../public/side_effect_errors.js';
import { AvmContext } from './avm_context.js';
import { AvmContractCallResult } from './avm_contract_call_result.js';
import { AvmExecutionEnvironment } from './avm_execution_environment.js';
import { type Gas } from './avm_gas.js';
import { AvmMachineState } from './avm_machine_state.js';
import { isAvmBytecode } from './bytecode_utils.js';
import {
  AvmExecutionError,
  InvalidProgramCounterError,
  NoBytecodeForContractError,
  revertReasonFromExceptionalHalt,
  revertReasonFromExplicitRevert,
} from './errors.js';
import { type AvmPersistableStateManager } from './journal/journal.js';
import { decodeInstructionFromBytecode } from './serialization/bytecode_serialization.js';
import { Opcode } from './serialization/instruction_serialization.js';

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
  private opcodeTallies: Map<string, OpcodeTally> = new Map();
  private pcTallies: Map<number, PcTally> = new Map();

  constructor(private context: AvmContext) {
    assert(
      context.machineState.gasLeft.l2Gas <= MAX_L2_GAS_PER_ENQUEUED_CALL,
      `Cannot allocate more than ${MAX_L2_GAS_PER_ENQUEUED_CALL} to the AVM for execution of an enqueued call`,
    );
    this.log = createDebugLogger(`aztec:avm_simulator:core(f:${context.environment.functionSelector.toString()})`);
  }

  public static create(
    stateManager: AvmPersistableStateManager,
    address: AztecAddress,
    sender: AztecAddress,
    functionSelector: FunctionSelector, // may be temporary (#7224)
    transactionFee: Fr,
    globals: GlobalVariables,
    isStaticCall: boolean,
    calldata: Fr[],
    allocatedGas: Gas,
  ) {
    const avmExecutionEnv = new AvmExecutionEnvironment(
      address,
      sender,
      functionSelector,
      /*contractCallDepth=*/ Fr.zero(),
      transactionFee,
      globals,
      isStaticCall,
      calldata,
    );

    const avmMachineState = new AvmMachineState(allocatedGas);
    const avmContext = new AvmContext(stateManager, avmExecutionEnv, avmMachineState);
    return new AvmSimulator(avmContext);
  }

  /**
   * Fetch the bytecode and execute it in the current context.
   */
  public async execute(): Promise<AvmContractCallResult> {
    const timer = new Timer();
    const bytecode = await this.context.persistableState.getBytecode(this.context.environment.address);
    this.log.info(`Retrieved bytecode in ${timer.ms()}ms`);
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
    assert(bytecode.length > 0, "AVM simulator can't execute empty bytecode");

    this.bytecode = bytecode;
    let totalExecutionTime = 0;
    let totalDecodeTime = 0;

    const executionTimes: number[] = [];
    const decodeTimes: number[] = [];
    const counts: number[] = [];

    const { machineState } = this.context;
    try {
      // Execute instruction pointed to by the current program counter
      // continuing until the machine state signifies a halt
      let instrCounter = 0;
      while (!machineState.getHalted()) {
        let timer = new Timer();
        const [instruction, bytesRead] = decodeInstructionFromBytecode(bytecode, machineState.pc);
        assert(
          !!instruction,
          'AVM attempted to execute non-existent instruction. This should never happen (invalid bytecode or AVM simulator bug)!',
        );
        let duration = timer.ms();
        totalDecodeTime += duration;
        if (decodeTimes[instruction.opcode] == undefined) {
          decodeTimes[instruction.opcode] = duration;
        } else {
          decodeTimes[instruction.opcode] += duration;
        }

        if (counts[instruction.opcode] == undefined) {
          counts[instruction.opcode] = 1;
        } else {
          counts[instruction.opcode]++;
        }

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
        machineState.nextPc = machineState.pc + bytesRead;
        timer = new Timer();
        await instruction.execute(this.context);
        if (!instruction.handlesPC()) {
          // Increment PC if the instruction doesn't handle it itself
          machineState.pc += bytesRead;
        }
        duration = timer.ms();
        totalExecutionTime += duration;

        if (executionTimes[instruction.opcode] == undefined) {
          executionTimes[instruction.opcode] = duration;
        } else {
          executionTimes[instruction.opcode] += duration;
        }

        // gas used by this instruction - used for profiling/tallying
        const gasUsed: Gas = {
          l2Gas: instrStartGas.l2Gas - machineState.l2GasLeft,
          daGas: instrStartGas.daGas - machineState.daGasLeft,
        };
        this.tallyInstruction(instrPc, instruction.constructor.name, gasUsed);

        if (machineState.pc >= bytecode.length) {
          this.log.warn('Passed end of program');
          throw new InvalidProgramCounterError(machineState.pc, /*max=*/ bytecode.length);
        }
      }

      const output = machineState.getOutput();
      const reverted = machineState.getReverted();
      const revertReason = reverted ? revertReasonFromExplicitRevert(output, this.context) : undefined;
      const results = new AvmContractCallResult(reverted, output, machineState.gasLeft, revertReason);
      this.log.debug(`Context execution results: ${results.toString()}`);

      this.log.info(
        `Total decode time ${totalDecodeTime}ms, total execution time ${totalExecutionTime}ms, num instructions ${instrCounter}`,
      );

      for (let i = 0; i < decodeTimes.length; i++) {
        if (decodeTimes[i] == undefined) {
          continue;
        }
        this.log.info(`Decode Opcode ${Opcode[i]}: ${decodeTimes[i]} / ${counts[i]} = ${decodeTimes[i] / counts[i]}`);
      }

      for (let i = 0; i < executionTimes.length; i++) {
        if (executionTimes[i] == undefined) {
          continue;
        }
        this.log.info(
          `Execution Opcode ${Opcode[i]}: ${executionTimes[i]} / ${counts[i]} = ${executionTimes[i] / counts[i]}`,
        );
      }

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
      // Note: "exceptional halts" cannot return data, hence [].
      const results = new AvmContractCallResult(/*reverted=*/ true, /*output=*/ [], machineState.gasLeft, revertReason);
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
