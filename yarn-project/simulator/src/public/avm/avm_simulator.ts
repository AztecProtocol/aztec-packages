import { MAX_L2_GAS_PER_TX_PUBLIC_PORTION } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { GasFees } from '@aztec/stdlib/gas';
import type { GlobalVariables } from '@aztec/stdlib/tx';

import { strict as assert } from 'assert';

import { SideEffectLimitReachedError } from '../side_effect_errors.js';
import type { PublicPersistableStateManager } from '../state_manager/state_manager.js';
import { AvmContext } from './avm_context.js';
import { AvmContractCallResult } from './avm_contract_call_result.js';
import { AvmExecutionEnvironment } from './avm_execution_environment.js';
import type { Gas } from './avm_gas.js';
import { AvmMachineState } from './avm_machine_state.js';
import type { AvmSimulatorInterface } from './avm_simulator_interface.js';
import { AvmExecutionError, AvmRevertReason, InvalidProgramCounterError } from './errors.js';
import type { Instruction } from './opcodes/instruction.js';
import { revertReasonFromExceptionalHalt, revertReasonFromExplicitRevert } from './revert_reason.js';
import {
  INSTRUCTION_SET,
  type InstructionSet,
  decodeInstructionFromBytecode,
} from './serialization/bytecode_serialization.js';

type OpcodeTally = {
  count: number;
  gas: Gas;
};

export class AvmSimulator implements AvmSimulatorInterface {
  private log: Logger;
  private bytecode: Buffer | undefined;
  private opcodeTallies: Map<string, OpcodeTally> = new Map();
  // maps pc to [instr, bytesRead]
  private deserializedInstructionsCache: Map<number, [Instruction, number]> = new Map();

  private tallyPrintFunction = () => {};
  private tallyInstructionFunction = (_b: string, _c: Gas) => {};

  // Test Purposes only: Logger will not have the proper function name. Use this constructor for testing purposes
  // only. Otherwise, use build() below.
  constructor(
    private context: AvmContext,
    private instructionSet: InstructionSet = INSTRUCTION_SET,
    enableTallying = false,
  ) {
    // This will be used by the CALL opcode to create a new simulator. It is required to
    // avoid a dependency cycle.
    context.provideSimulator = AvmSimulator.build;
    assert(
      context.machineState.gasLeft.l2Gas <= MAX_L2_GAS_PER_TX_PUBLIC_PORTION,
      `Cannot allocate more than ${MAX_L2_GAS_PER_TX_PUBLIC_PORTION} to the AVM for execution.`,
    );
    this.log = createLogger(`simulator:avm(calldata[0]: ${context.environment.calldata[0]})`);
    // Turn on tallying if explicitly enabled or if trace logging
    if (enableTallying || this.log.isLevelEnabled('trace')) {
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
    stateManager: PublicPersistableStateManager,
    address: AztecAddress,
    sender: AztecAddress,
    transactionFee: Fr,
    globals: GlobalVariables,
    isStaticCall: boolean,
    calldata: Fr[],
    allocatedGas: Gas,
    effectiveGasFees: GasFees,
    clientInitiatedSimulation: boolean = false,
  ) {
    const avmExecutionEnv = new AvmExecutionEnvironment(
      address,
      sender,
      /*contractCallDepth=*/ Fr.zero(),
      transactionFee,
      globals,
      isStaticCall,
      calldata,
      effectiveGasFees,
      clientInitiatedSimulation,
    );

    const avmMachineState = new AvmMachineState(allocatedGas);
    const avmContext = new AvmContext(stateManager, avmExecutionEnv, avmMachineState);
    return await AvmSimulator.build(avmContext);
  }

  /**
   * Fetch the bytecode and execute it in the current context.
   */
  public async execute(): Promise<AvmContractCallResult> {
    let bytecode: Buffer | undefined;
    try {
      bytecode = await this.context.persistableState.getBytecode(this.context.environment.address);
    } catch (err: any) {
      if (!(err instanceof AvmExecutionError || err instanceof SideEffectLimitReachedError)) {
        this.log.error(`Unknown error thrown by AVM during bytecode retrieval: ${err}`);
        throw err;
      }
      return await this.handleFailureToRetrieveBytecode(
        `Bytecode retrieval for contract '${this.context.environment.address}' failed with ${err.message}. Reverting...`,
      );
    }

    if (!bytecode) {
      return await this.handleFailureToRetrieveBytecode(
        `No bytecode found at: ${this.context.environment.address}. Reverting...`,
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
    const startTotalTime = performance.now();
    assert(bytecode.length > 0, "AVM simulator can't execute empty bytecode");

    this.bytecode = bytecode;

    const { machineState } = this.context;
    const callStartGas = machineState.gasLeft; // Save gas before executing instruction (for profiling)
    try {
      // Execute instruction pointed to by the current program counter
      // continuing until the machine state signifies a halt
      while (!machineState.getHalted()) {
        // Get the instruction from cache, or deserialize for the first time
        let cachedInstruction = this.deserializedInstructionsCache.get(machineState.pc);

        if (cachedInstruction === undefined) {
          cachedInstruction = decodeInstructionFromBytecode(bytecode, machineState.pc, this.instructionSet);
          this.deserializedInstructionsCache.set(machineState.pc, cachedInstruction);
        }
        const [instruction, bytesRead] = cachedInstruction;

        const instrStartGas = machineState.gasLeft; // Save gas before executing instruction (for profiling)

        if (this.log.isLevelEnabled('trace')) {
          // Skip this entirely to avoid toStringing etc if trace is not enabled
          this.log.trace(
            `[PC:${machineState.pc}] [IC:${machineState.instrCounter}] ${instruction.toString()} (gasLeft l2=${
              machineState.l2GasLeft
            } da=${machineState.daGasLeft})`,
          );
        }
        machineState.nextPc = machineState.pc + bytesRead;

        // Execute the instruction.
        // Normal returns and reverts will return normally here.
        // "Exceptional halts" will throw.
        await instruction.execute(this.context);
        if (!instruction.handlesPC()) {
          // Increment PC if the instruction doesn't handle it itself
          machineState.pc += bytesRead;
        }

        machineState.instrCounter++;

        // gas used by this instruction - used for profiling/tallying
        const gasUsed: Gas = {
          l2Gas: instrStartGas.l2Gas - machineState.l2GasLeft,
          daGas: instrStartGas.daGas - machineState.daGasLeft,
        };
        this.tallyInstructionFunction(instruction.constructor.name, gasUsed);

        if (machineState.pc >= bytecode.length) {
          this.log.warn('Passed end of program');
          throw new InvalidProgramCounterError(machineState.pc, /*max=*/ bytecode.length);
        }
      }

      const output = machineState.getOutput();
      const reverted = machineState.getReverted();
      const revertReason = reverted ? await revertReasonFromExplicitRevert(output, this.context) : undefined;
      const results = new AvmContractCallResult(
        reverted,
        output,
        machineState.gasLeft,
        revertReason,
        machineState.instrCounter,
      );
      this.log.debug(`Context execution results: ${results.toString()}`);
      const totalGasUsed: Gas = {
        l2Gas: callStartGas.l2Gas - machineState.l2GasLeft,
        daGas: callStartGas.daGas - machineState.daGasLeft,
      };
      this.log.debug(`Executed ${machineState.instrCounter} instructions and consumed ${totalGasUsed.l2Gas} L2 Gas`);

      this.tallyPrintFunction();

      const endTotalTime = performance.now();
      const totalTime = endTotalTime - startTotalTime;
      this.log.debug(`Core AVM simulation took ${totalTime}ms`);

      // Return results for processing by calling context
      return results;
    } catch (err: any) {
      this.log.verbose('Exceptional halt (revert by something other than REVERT opcode)');
      // FIXME: weird that we have to do this OutOfGasError check because:
      // 1. OutOfGasError is an AvmExecutionError, so that check should cover both
      // 2. We should at least be able to do instanceof OutOfGasError instead of checking the constructor name
      if (
        !(
          err.constructor.name == 'OutOfGasError' ||
          err instanceof AvmExecutionError ||
          err instanceof SideEffectLimitReachedError
        )
      ) {
        this.log.error(`Unknown error thrown by AVM: ${err}`);
        throw err;
      }

      const revertReason = await revertReasonFromExceptionalHalt(err, this.context);
      // Exceptional halts consume all allocated gas
      const noGasLeft = { l2Gas: 0, daGas: 0 };
      // Note: "exceptional halts" cannot return data, hence [].
      const results = new AvmContractCallResult(
        /*reverted=*/ true,
        /*output=*/ [],
        noGasLeft,
        revertReason,
        machineState.instrCounter,
      );
      this.log.debug(`Context execution results: ${results.toString()}`);

      this.tallyPrintFunction();
      // Return results for processing by calling context
      return results;
    }
  }

  private async handleFailureToRetrieveBytecode(message: string): Promise<AvmContractCallResult> {
    // revert, consuming all gas
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

  private tallyInstruction(opcode: string, gasUsed: Gas) {
    const opcodeTally = this.opcodeTallies.get(opcode) || ({ count: 0, gas: { l2Gas: 0, daGas: 0 } } as OpcodeTally);
    opcodeTally.count++;
    opcodeTally.gas.l2Gas += gasUsed.l2Gas;
    opcodeTally.gas.daGas += gasUsed.daGas;
    this.opcodeTallies.set(opcode, opcodeTally);
  }

  private printOpcodeTallies() {
    this.log.debug(`Printing tallies per opcode sorted by gas...`);
    // sort descending by L2 gas consumed
    const sortedOpcodes = Array.from(this.opcodeTallies.entries()).sort((a, b) => b[1].gas.l2Gas - a[1].gas.l2Gas);
    for (const [opcode, tally] of sortedOpcodes) {
      // NOTE: don't care to clutter the logs with DA gas for now
      this.log.debug(`${opcode} executed ${tally.count} times consuming a total of ${tally.gas.l2Gas} L2 gas`);
    }
  }
}
