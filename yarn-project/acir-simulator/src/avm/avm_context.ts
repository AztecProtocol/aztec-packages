import { AztecAddress, FunctionSelector } from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';
import { createDebugLogger } from '@aztec/foundation/log';

import { assert } from 'console';

import { AvmExecutionEnvironment } from './avm_execution_environment.js';
import { AvmMachineState, InitialAvmMachineState } from './avm_machine_state.js';
import { AvmContractCallResults } from './avm_message_call_result.js';
import { AvmExecutionError, InvalidProgramCounterError, NoBytecodeForContractError } from './errors.js';
import { initExecutionEnvironment, initInitialMachineState } from './fixtures/index.js';
import { AvmWorldStateJournal } from './journal/journal.js';
import { type Instruction } from './opcodes/index.js';
import { decodeFromBytecode } from './serialization/bytecode_serialization.js';

/**
 * Avm Context manages the state and execution of the AVM
 */
export class AvmContext {
  /** Contains constant variables provided by the kernel */
  public environment: AvmExecutionEnvironment = initExecutionEnvironment();
  /** VM state that is modified on an instruction-by-instruction basis */
  public machineState: AvmMachineState;
  /** Manages mutable state during execution - (caching, fetching) */
  public worldState: AvmWorldStateJournal;

  /** The public contract code corresponding to this context's contract class */
  private instructions: Instruction[];

  /** Stage data for public kernel (1-kernel-per-call).
   *  Shouldn't be necessary once kernel processes an entire AVM Session. */
  // TODO(4293): Integrate simulator with public kernel
  //private nestedExecutions: PublicExecutionResult[] = [];

  constructor(
    worldState: AvmWorldStateJournal,
    environment: AvmExecutionEnvironment = initExecutionEnvironment(),
    /** Some initial values for machine state */
    initialMachineState: InitialAvmMachineState = initInitialMachineState(),
    private log = createDebugLogger('aztec:avm_simulator:avm_context'),
  ) {
    this.worldState = worldState;
    this.environment = environment;
    this.machineState = new AvmMachineState(initialMachineState);
    // Bytecode is fetched and instructions are decoded in async init()
    this.instructions = [];
  }

  /**
   * Set instructions directly (execute() will then skip bytecode fetch & decode)
   * Warning: FOR TESTING PURPOSES ONLY!
   * @param instructions - The decoded instructions to inject into this context
   */
  setInstructions(instructions: Instruction[]) {
    this.instructions = instructions;
  }

  /**
   * Execute the contract code within the current context.
   */
  async execute(): Promise<AvmContractCallResults> {
    if (this.instructions.length == 0) {
      // Note: contract code may have been loaded for a test via setInstructions in which case
      // fetch is skipped
      // TODO(4409): decide what happens if contract instance does not exist (has no code)
      await this.fetchAndDecodeBytecode();
    }
    // Cannot execute empty contract or uninitialized context
    assert(this.instructions.length > 0);

    try {
      // Execute instruction pointed to by the current program counter
      // continuing until the machine state signifies a halt
      while (!this.machineState.halted) {
        const instruction = this.instructions[this.machineState.pc];
        assert(!!instruction); // This should never happen

        this.log(`Executing PC=${this.machineState.pc}: ${instruction.toString()}`);
        // Execute the instruction.
        // Normal returns and reverts will return normally here.
        // "Exceptional halts" will throw.
        await instruction.execute(this);

        if (this.machineState.pc >= this.instructions.length) {
          this.log('Passed end of program!');
          throw new InvalidProgramCounterError(this.machineState.pc, /*max=*/ this.instructions.length);
        }
      }

      // Return results for processing by calling context
      const results = this.machineState.getResults();
      this.log(`Context execution results: ${results.toString()}`);
      return results;
    } catch (e) {
      this.log('Exceptional halt');
      if (!(e instanceof AvmExecutionError)) {
        this.log(`Unknown error thrown by avm: ${e}`);
        throw e;
      }

      // Return results for processing by calling context
      // Note: "exceptional halts" cannot return data
      const results = new AvmContractCallResults(/*reverted=*/ true, /*output*/ [], /*revertReason=*/ e);
      this.log(`Context execution results: ${results.toString()}`);
      return results;
    }
  }

  /**
   * Fetch contract bytecode from world state and decode into executable instructions.
   */
  private async fetchAndDecodeBytecode() {
    // NOTE: the following is mocked as getPublicBytecode does not exist yet
    const selector = new FunctionSelector(0);
    const bytecode = await this.worldState.hostStorage.contractsDb.getBytecode(this.environment.address, selector);

    // This assumes that we will not be able to send messages to accounts without code
    // Pending classes and instances impl details
    if (!bytecode) {
      throw new NoBytecodeForContractError(this.environment.address);
    }

    this.instructions = decodeFromBytecode(bytecode);
  }

  /**
   * Prepare a new AVM context that will be ready for an external/nested call
   * - Fork the world state journal
   * - Derive an execution environment from the caller/parent
   *    - Alter both address and storageAddress
   *
   * @param address - The contract instance to initialize a context for
   * @param calldata - Data/arguments for nested call
   * @param parentEnvironment - The caller/parent environment
   * @param initialMachineState - The initial machine state (derived from call instruction args)
   * @param parentWorldState - The caller/parent world state (journal)
   * @returns new AvmContext instance
   */
  public static async createNestedContractCallContext(
    address: AztecAddress,
    calldata: Fr[],
    parentEnvironment: AvmExecutionEnvironment,
    initialMachineState: InitialAvmMachineState,
    parentWorldState: AvmWorldStateJournal,
  ): Promise<AvmContext> {
    const newExecutionEnvironment = parentEnvironment.deriveEnvironmentForNestedCall(address, calldata);
    const forkedState = parentWorldState.fork();
    const nestedContext = new AvmContext(forkedState, newExecutionEnvironment, initialMachineState);
    await nestedContext.fetchAndDecodeBytecode();
    return nestedContext;
  }

  /**
   * Prepare a new AVM context that will be ready for an external/nested static call
   * - Fork the world state journal
   * - Derive an execution environment from the caller/parent
   *    - Alter both address and storageAddress
   *
   * @param address - The contract instance to initialize a context for
   * @param calldata - Data/arguments for nested call
   * @param parentEnvironment - The caller/parent environment
   * @param initialMachineState - The initial machine state (derived from call instruction args)
   * @param parentWorldState - The caller/parent world state (journal)
   * @returns new AvmContext instance
   */
  public static async createNestedStaticCallContext(
    address: AztecAddress,
    calldata: Fr[],
    parentEnvironment: AvmExecutionEnvironment,
    initialMachineState: InitialAvmMachineState,
    parentWorldState: AvmWorldStateJournal,
  ): Promise<AvmContext> {
    const newExecutionEnvironment = parentEnvironment.deriveEnvironmentForNestedStaticCall(address, calldata);
    const forkedState = parentWorldState.fork();
    const nestedContext = new AvmContext(forkedState, newExecutionEnvironment, initialMachineState);
    await nestedContext.fetchAndDecodeBytecode();
    return nestedContext;
  }
}
