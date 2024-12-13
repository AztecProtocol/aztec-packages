import { type AztecAddress, Fr, type GlobalVariables, MAX_L2_GAS_PER_TX_PUBLIC_PORTION } from '@aztec/circuits.js';
import { type Logger, createLogger } from '@aztec/foundation/log';

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
  AvmRevertReason,
  InvalidProgramCounterError,
  revertReasonFromExceptionalHalt,
  revertReasonFromExplicitRevert,
} from './errors.js';
import { type AvmPersistableStateManager } from './journal/journal.js';
import {
  INSTRUCTION_SET,
  type InstructionSet,
  decodeInstructionFromBytecode,
} from './serialization/bytecode_serialization.js';

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
  private log: Logger;
  private bytecode: Buffer | undefined;
  private opcodeTallies: Map<string, OpcodeTally> = new Map();
  private pcTallies: Map<number, PcTally> = new Map();

  private tallyPrintFunction = () => {};
  private tallyInstructionFunction = (_a: number, _b: string, _c: Gas) => {};

  // Test Purposes only: Logger will not have the proper function name. Use this constructor for testing purposes
  // only. Otherwise, use build() below.
  constructor(private context: AvmContext, private instructionSet: InstructionSet = INSTRUCTION_SET()) {
    assert(
      context.machineState.gasLeft.l2Gas <= MAX_L2_GAS_PER_TX_PUBLIC_PORTION,
      `Cannot allocate more than ${MAX_L2_GAS_PER_TX_PUBLIC_PORTION} to the AVM for execution.`,
    );
    this.log = createLogger(`simulator:avm(calldata[0]: ${context.environment.calldata[0]})`);
    // TODO(palla/log): Should tallies be printed on debug, or only on trace?
    if (this.log.isLevelEnabled('debug')) {
      this.tallyPrintFunction = this.printOpcodeTallies;
      this.tallyInstructionFunction = this.tallyInstruction;
    }
  }

  // Factory to have a proper function name in the logger. Retrieving the name is asynchronous and
  // cannot be done as part of the constructor.
  public static async build(context: AvmContext): Promise<AvmSimulator> {
    const simulator = new AvmSimulator(context);
    const fnName = await context.persistableState.getPublicFunctionDebugName(context.environment);
    simulator.log = createLogger(`simulator:avm(f:${fnName})`);

    return simulator;
  }

  public static async create(
    stateManager: AvmPersistableStateManager,
    address: AztecAddress,
    sender: AztecAddress,
    transactionFee: Fr,
    globals: GlobalVariables,
    isStaticCall: boolean,
    calldata: Fr[],
    allocatedGas: Gas,
  ) {
    const avmExecutionEnv = new AvmExecutionEnvironment(
      address,
      sender,
      /*contractCallDepth=*/ Fr.zero(),
      transactionFee,
      globals,
      isStaticCall,
      calldata,
    );

    const avmMachineState = new AvmMachineState(allocatedGas);
    const avmContext = new AvmContext(stateManager, avmExecutionEnv, avmMachineState);
    return await AvmSimulator.build(avmContext);
  }

  /**
   * Fetch the bytecode and execute it in the current context.
   */
  public async execute(): Promise<AvmContractCallResult> {
    const bytecode = await this.context.persistableState.getBytecode(this.context.environment.address);
    if (!bytecode) {
      // revert, consuming all gas
      const message = `No bytecode found at: ${this.context.environment.address}. Reverting...`;
      const fnName = await this.context.persistableState.getPublicFunctionDebugName(this.context.environment);
      const revertReason = new AvmRevertReason(
        message,
        /*failingFunction=*/ {
          contractAddress: this.context.environment.address,
          functionName: fnName,
        },
        /*noirCallStack=*/ [],
      );
      this.log.warn(message);
      return new AvmContractCallResult(
        /*reverted=*/ true,
        /*output=*/ [],
        /*gasLeft=*/ { l2Gas: 0, daGas: 0 }, // consumes all allocated gas
        revertReason,
      );
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

    const { machineState } = this.context;
    try {
      // Execute instruction pointed to by the current program counter
      // continuing until the machine state signifies a halt
      let instrCounter = 0;
      while (!machineState.getHalted()) {
        const [instruction, bytesRead] = decodeInstructionFromBytecode(bytecode, machineState.pc, this.instructionSet);
        const instrStartGas = machineState.gasLeft; // Save gas before executing instruction (for profiling)
        const instrPc = machineState.pc; // Save PC before executing instruction (for profiling)

        this.log.trace(
          `[PC:${machineState.pc}] [IC:${instrCounter++}] ${instruction.toString()} (gasLeft l2=${
            machineState.l2GasLeft
          } da=${machineState.daGasLeft})`,
        );
        // Execute the instruction.
        // Normal returns and reverts will return normally here.
        // "Exceptional halts" will throw.
        machineState.nextPc = machineState.pc + bytesRead;

        await instruction.execute(this.context);
        if (!instruction.handlesPC()) {
          // Increment PC if the instruction doesn't handle it itself
          machineState.pc += bytesRead;
        }

        // gas used by this instruction - used for profiling/tallying
        const gasUsed: Gas = {
          l2Gas: instrStartGas.l2Gas - machineState.l2GasLeft,
          daGas: instrStartGas.daGas - machineState.daGasLeft,
        };
        this.tallyInstructionFunction(instrPc, instruction.constructor.name, gasUsed);

        if (machineState.pc >= bytecode.length) {
          this.log.warn('Passed end of program');
          throw new InvalidProgramCounterError(machineState.pc, /*max=*/ bytecode.length);
        }
      }

      const output = machineState.getOutput();
      const reverted = machineState.getReverted();
      const revertReason = reverted ? await revertReasonFromExplicitRevert(output, this.context) : undefined;
      const results = new AvmContractCallResult(reverted, output, machineState.gasLeft, revertReason);
      this.log.debug(`Context execution results: ${results.toString()}`);

      this.tallyPrintFunction();
      // Return results for processing by calling context
      return results;
    } catch (err: any) {
      this.log.verbose('Exceptional halt (revert by something other than REVERT opcode)');
      if (!(err instanceof AvmExecutionError || err instanceof SideEffectLimitReachedError)) {
        this.log.error(`Unknown error thrown by AVM: ${err}`);
        throw err;
      }

      const revertReason = await revertReasonFromExceptionalHalt(err, this.context);
      // Exceptional halts consume all allocated gas
      const noGasLeft = { l2Gas: 0, daGas: 0, };
      // Note: "exceptional halts" cannot return data, hence [].
      const results = new AvmContractCallResult(/*reverted=*/ true, /*output=*/ [], noGasLeft, revertReason);
      this.log.debug(`Context execution results: ${results.toString()}`);

      this.tallyPrintFunction();
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
