import { AztecAddress, FunctionSelector } from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';

import { AvmExecutionEnvironment } from './avm_execution_environment.js';
import { AvmMachineState, InitialAvmMachineState } from './avm_machine_state.js';
import { AvmWorldStateJournal } from './journal/journal.js';
import { decodeFromBytecode } from './serialization/bytecode_serialization.js';
import { InstructionExecutionError, type Instruction } from './opcodes/index.js';
import { AvmContractCallResults } from './avm_message_call_result.js';
import { AvmInterpreterError, InvalidProgramCounterError, NoBytecodeFoundInterpreterError } from './errors.js';

import { assert } from 'console';
import { createDebugLogger } from '@aztec/foundation/log';

export type AvmContextInputs = {
  environment: AvmExecutionEnvironment,
  initialMachineState: InitialAvmMachineState,
}

/**
 * Avm Context manages the state and execution of the AVM
 */
export class AvmContext {
  /** Contains constant variables provided by the kernel */
  public environment: AvmExecutionEnvironment;
  /** VM state that is modified on an instruction-by-instruction basis */
  public machineState: AvmMachineState;
  //public results: AvmContractCallResults = { reverted: false, output: []};

  /** Manages mutable state during execution - (caching, fetching) */
  public journal: AvmWorldStateJournal;

  /** The public contract code corresponding to this context's contract class */
  private instructions: Instruction[];

  /** Stage data for public kernel (1-kernel-per-call).
   *  Shouldn't be necessary once kernel processes an entire AVM Session. */
  //private nestedExecutions: PublicExecutionResult[] = [];

  constructor(
    // TODO: just accept environment and initial machine state as separate inputs
    // TODO: add AvmSession that accepts the equivalent of "circuit inputs"
    contextInputs: AvmContextInputs,
    journal: AvmWorldStateJournal,
    private log = createDebugLogger('aztec:avm_simulator:avm_context'),
  ) {
    this.environment = contextInputs.environment;
    this.machineState = new AvmMachineState(contextInputs.initialMachineState);
    this.journal = journal;
    // Bytecode is fetched and instructions are decoded in async init()
    this.instructions = [];
  }

  async init() {
    // NOTE: the following is mocked as getPublicBytecode does not exist yet
    const selector = new FunctionSelector(0);
    const bytecode = await this.journal.hostStorage.contractsDb.getBytecode(
      this.environment.address,
      selector,
    );

    // This assumes that we will not be able to send messages to accounts without code
    // Pending classes and instances impl details
    if (!bytecode) {
      throw new NoBytecodeFoundInterpreterError(this.environment.address);
    }

    this.instructions = decodeFromBytecode(bytecode);
  }

  /**
   * For testing purposes (to skip bytecode decoding)
   */
  setInstructions(instructions: Instruction[]) {
    this.instructions = instructions;
  }

  /**
   * Execute the contract code within the current context.
   *
   * - Retrieve and decode bytecode
   * - Interpret the bytecode
   * - Execute
   *
   */
  async execute(): Promise<AvmContractCallResults> {
    // Cannot execute empty contract or uninitialized context
    assert(this.instructions.length > 0);

    try {
      while (!this.machineState.halted) {
        const instruction = this.instructions[this.machineState.pc];
        assert(!!instruction); // This should never happen

        this.log(`Executing PC=${this.machineState.pc}: ${instruction.toString()}`);
        await instruction.execute(this);

        if (this.machineState.pc >= this.instructions.length) {
          this.log('Passed end of program!');
          throw new InvalidProgramCounterError(this.machineState.pc, /*max=*/ this.instructions.length);
        }
      }

      // return results for processing by calling context
      const results = this.machineState.getResults();
      this.log(`Context execution results: ${results.toString()}`);
      return results;
    } catch (e) {
      this.log('Exceptional halt');
      if (!(e instanceof AvmInterpreterError || e instanceof InstructionExecutionError)) {
        this.log(`Unknown error thrown by avm: ${e}`);
        throw e;
      }

      // Exceptional halts cannot return data
      const results = new AvmContractCallResults(/*reverted=*/ true, /*output*/ [], /*revertReason=*/ e);
      this.log(`Context execution results: ${results.toString()}`);
      return results;
    }
  }

  /**
   * Prepare a new AVM context that will be ready for an external call
   * - It will fork the journal
   * - It will set the correct execution Environment Variables for a call
   *    - Alter both address and storageAddress
   *
   * @param address - The contract to call
   * @param parentEnvironment - The current execution environment
   * @param journal - The current journal
   * @returns new AvmContext instance
   */
  public static async createNestedContractCallContext(
    address: AztecAddress,
    calldata: Fr[],
    parentEnvironment: AvmExecutionEnvironment,
    initialMachineState: InitialAvmMachineState,
    journal: AvmWorldStateJournal,
  ): Promise<AvmContext> {
    const newExecutionEnvironment = parentEnvironment.deriveEnvironmentForNestedCall(address, calldata);
    const newContextInputs = { environment: newExecutionEnvironment, initialMachineState };
    const forkedState = AvmWorldStateJournal.branchParent(journal);
    const nestedContext = new AvmContext(newContextInputs, forkedState);
    await nestedContext.init();
    return nestedContext;
  }

  /**
   * Prepare a new AVM context that will be ready for an external static call
   * - It will fork the journal
   * - It will set the correct execution Environment Variables for a call
   *    - Alter both address and storageAddress
   *
   * @param address - The contract to call
   * @param parentEnvironment - The current execution environment
   * @param journal - The current journal
   * @returns new AvmContext instance
   */
  public static async createNestedStaticCallContext(
    address: AztecAddress,
    calldata: Fr[],
    parentEnvironment: AvmExecutionEnvironment,
    initialMachineState: InitialAvmMachineState,
    journal: AvmWorldStateJournal,
  ): Promise<AvmContext> {
    const newExecutionEnvironment = parentEnvironment.deriveEnvironmentForNestedStaticCall(address, calldata);
    const newContextInputs: AvmContextInputs = { environment: newExecutionEnvironment, initialMachineState };
    const forkedState = AvmWorldStateJournal.branchParent(journal);
    const nestedContext = new AvmContext(newContextInputs, forkedState);
    await nestedContext.init();
    return nestedContext;
  }
}
