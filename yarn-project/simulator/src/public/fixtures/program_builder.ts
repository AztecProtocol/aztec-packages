import {
  AVM_ADD_BASE_L2_GAS,
  AVM_JUMPI_BASE_L2_GAS,
  AVM_LT_BASE_L2_GAS,
  AVM_MAX_PROCESSABLE_L2_GAS,
  AVM_RETURN_BASE_L2_GAS,
  AVM_SET_BASE_L2_GAS,
  MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS,
} from '@aztec/constants';
import { FunctionType, emptyContractArtifact, emptyFunctionArtifact } from '@aztec/stdlib/abi';
import type { ContractArtifact } from '@aztec/stdlib/abi';

import { TypeTag } from '../avm/avm_memory_types.js';
import { Add, Instruction, Jump, JumpI, Lt, Return, Set } from '../avm/opcodes/index.js';
import { encodeToBytecode } from '../avm/serialization/bytecode_serialization.js';
import { Opcode } from '../avm/serialization/instruction_serialization.js';
import type { PublicTxSimulationTester } from './public_tx_simulation_tester.js';

// Memory offsets for loop control
const LOOP_COUNTER_OFFSET = 10000;
const LOOP_LIMIT_OFFSET = 10001;
const LOOP_TEMP_OFFSET = 10002;
const RETURN_SIZE_OFFSET = 20000;

// Bytecode size limit: The bufferAsFields function adds 1 length field, then packs 31 bytes per field
// So we have: 1 length field + 2999 data fields = 3000 total fields
// Maximum bytecode size = 2999 * 31 = 92969 bytes
const MAX_BYTECODE_SIZE_IN_BYTES = (MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS - 1) * 31;

export interface ProgramBuildConfig {
  /** The opcode name for logging */
  opcodeName: string;
  /** Function to create the operation to spam */
  createOperation: () => Instruction;
  /** Gas cost per operation */
  gasPerOp: number;
  /** Setup instructions to initialize memory before the main loop */
  setupInstructions?: Instruction[];
  /** Gas cost for setup instructions */
  setupGas?: number;
  /** Logger for debugging */
  tester?: PublicTxSimulationTester;
}

/**
 * Result of building a program
 */
export interface ProgramBuildResult {
  /** The complete bytecode */
  bytecode: Buffer;
  /** The contract artifact */
  artifact: ContractArtifact;
  /** Statistics about the built program */
  stats: {
    totalInstructions: number;
    bytecodeSize: number;
    estimatedGas: number;
    loopIterations?: number;
    opsPerIteration?: number;
  };
}

/**
 * Abstract base class for building AVM programs with loops.
 * Provides common logic for constructing programs with setup routines,
 * loop control, and exit routines.
 */
export abstract class ProgramBuilder {
  protected config: ProgramBuildConfig;
  protected instructions: Instruction[] = [];

  constructor(config: ProgramBuildConfig) {
    this.config = config;
  }

  /**
   * Build the complete program
   */
  public build(): ProgramBuildResult {
    // Add setup instructions
    this.addSetupInstructions();

    // Add loop setup (if needed)
    const loopSetupSize = this.getLoopSetupBytecodeSize();
    if (loopSetupSize > 0) {
      this.addLoopSetupInstructions();
    }

    // Calculate available space for loop body
    const currentSize = encodeToBytecode(this.instructions).length;
    const loopControlSize = this.getLoopControlBytecodeSize();
    const exitSize = this.getExitBytecodeSize();
    const availableForBody = MAX_BYTECODE_SIZE_IN_BYTES - currentSize - loopControlSize - exitSize;

    // Add loop body
    const loopStats = this.addLoopBody(availableForBody);

    // Add exit instructions
    this.addExitInstructions();

    // Create bytecode
    const bytecode = encodeToBytecode(this.instructions);

    // Log stats
    if (this.config.tester) {
      this.logStats(bytecode, loopStats);
    }

    // Create contract artifact
    const artifact = this.createArtifact(bytecode);

    return {
      bytecode,
      artifact,
      stats: {
        totalInstructions: this.instructions.length,
        bytecodeSize: bytecode.length,
        estimatedGas: this.calculateTotalGas(loopStats),
        ...loopStats,
      },
    };
  }

  /**
   * Add setup instructions to the program
   */
  protected addSetupInstructions(): void {
    if (this.config.setupInstructions) {
      this.instructions.push(...this.config.setupInstructions);
    }
  }

  /**
   * Get the bytecode size of loop setup instructions
   */
  protected abstract getLoopSetupBytecodeSize(): number;

  /**
   * Add loop setup instructions (e.g., initialize counters)
   */
  protected abstract addLoopSetupInstructions(): void;

  /**
   * Get the bytecode size of loop control instructions
   */
  protected abstract getLoopControlBytecodeSize(): number;

  /**
   * Add the loop body and control instructions
   * @param availableSpace - Available bytecode space for the loop body
   * @returns Statistics about the loop
   */
  protected abstract addLoopBody(availableSpace: number): {
    loopIterations?: number;
    opsPerIteration?: number;
    totalOps?: number;
  };

  /**
   * Get the bytecode size of exit instructions
   */
  protected abstract getExitBytecodeSize(): number;

  /**
   * Add exit instructions to the program
   */
  protected abstract addExitInstructions(): void;

  /**
   * Calculate total gas consumption
   */
  protected abstract calculateTotalGas(loopStats: {
    loopIterations?: number;
    opsPerIteration?: number;
    totalOps?: number;
  }): number;

  /**
   * Log statistics about the built program
   */
  protected logStats(
    bytecode: Buffer,
    loopStats: { loopIterations?: number; opsPerIteration?: number; totalOps?: number },
  ): void {
    const tester = this.config.tester;
    if (!tester) {
      return;
    }

    const opName = this.config.opcodeName;
    tester.logger.debug(`[${opName}] Total instructions: ${this.instructions.length}`);
    tester.logger.debug(
      `[${opName}] Bytecode size: ${bytecode.length} bytes (${Math.round((bytecode.length * 100) / MAX_BYTECODE_SIZE_IN_BYTES)}% of max)`,
    );

    if (loopStats.loopIterations !== undefined) {
      tester.logger.debug(`[${opName}] Loop iterations: ${loopStats.loopIterations}`);
    }
    if (loopStats.opsPerIteration !== undefined) {
      tester.logger.debug(`[${opName}] Operations per iteration: ${loopStats.opsPerIteration}`);
    }
    if (loopStats.totalOps !== undefined) {
      tester.logger.debug(`[${opName}] Total operations: ${loopStats.totalOps}`);
    }

    const estimatedGas = this.calculateTotalGas(loopStats);
    tester.logger.debug(`[${opName}] Estimated total gas: ${estimatedGas}`);
  }

  /**
   * Create a contract artifact from the bytecode
   */
  protected createArtifact(bytecode: Buffer): ContractArtifact {
    const artifact = emptyContractArtifact();
    artifact.name = `${this.config.opcodeName}SpamContract`;
    artifact.functions = [emptyFunctionArtifact()];
    artifact.functions[0].name = 'public_dispatch';
    artifact.functions[0].functionType = FunctionType.PUBLIC;
    artifact.functions[0].bytecode = bytecode;
    return artifact;
  }

  /**
   * Calculate how many operations can fit in the given space
   */
  protected calculateOpsForSpace(availableSpace: number): number {
    const singleOpSize = encodeToBytecode([this.config.createOperation()]).length;
    return Math.floor(availableSpace / singleOpSize);
  }
}

/**
 * Builds a program that runs a bounded loop until just before gas exhaustion,
 * then exits cleanly and consumes remaining gas with direct operations.
 */
export class BoundedLoopSpammer extends ProgramBuilder {
  private static readonly LOOP_ITERATIONS = 1000;
  private opsPerIteration: number = 0;
  private remainingOps: number = 0;

  protected createLoopSetupInstructions(): Instruction[] {
    return [
      new Set(0, LOOP_COUNTER_OFFSET, TypeTag.UINT32, 0).as(Opcode.SET_32, Set.wireFormat32),
      new Set(0, LOOP_LIMIT_OFFSET, TypeTag.UINT32, BoundedLoopSpammer.LOOP_ITERATIONS).as(
        Opcode.SET_32,
        Set.wireFormat32,
      ),
      new Set(0, LOOP_TEMP_OFFSET, TypeTag.UINT32, 1).as(Opcode.SET_32, Set.wireFormat32),
    ];
  }

  protected getLoopSetupBytecodeSize(): number {
    return encodeToBytecode(this.createLoopSetupInstructions()).length;
  }

  protected getLoopSetupGas(): number {
    // TODO(dbanks12): could use BASE_GAS_COSTS map here and sum the actual instruction costs
    return 3 * AVM_SET_BASE_L2_GAS;
  }

  protected addLoopSetupInstructions(): void {
    this.instructions.push(...this.createLoopSetupInstructions());
  }

  protected createLoopControlInstructions(loc: number = 0): Instruction[] {
    return [
      new Add(0, LOOP_COUNTER_OFFSET, LOOP_TEMP_OFFSET, LOOP_COUNTER_OFFSET).as(Opcode.ADD_16, Add.wireFormat16),
      new Lt(0, LOOP_COUNTER_OFFSET, LOOP_LIMIT_OFFSET, LOOP_TEMP_OFFSET + 1).as(Opcode.LT_16, Lt.wireFormat16),
      new JumpI(0, LOOP_TEMP_OFFSET + 1, loc).as(Opcode.JUMPI_32, JumpI.wireFormat),
    ];
  }

  protected getLoopControlBytecodeSize(): number {
    return encodeToBytecode(this.createLoopControlInstructions()).length;
  }

  protected getLoopControlGas(): number {
    // TODO(dbanks12): could use BASE_GAS_COSTS map here and sum the actual instruction costs
    return AVM_ADD_BASE_L2_GAS + AVM_LT_BASE_L2_GAS + AVM_JUMPI_BASE_L2_GAS;
  }

  protected createReturnInstructions(returnSizeOffset: number = RETURN_SIZE_OFFSET): Instruction[] {
    return [
      new Set(0, returnSizeOffset, TypeTag.UINT32, 0).as(Opcode.SET_8, Set.wireFormat8),
      new Return(0, returnSizeOffset, 0).as(Opcode.RETURN, Return.wireFormat),
    ];
  }

  protected getReturnGas(): number {
    // TODO(dbanks12): could use BASE_GAS_COSTS map here and sum the actual instruction costs
    return AVM_SET_BASE_L2_GAS + AVM_RETURN_BASE_L2_GAS;
  }

  protected getExitBytecodeSize(): number {
    // For bounded loops, we need to estimate exit size without calculating exact remaining ops
    // Return instruction size is fixed
    const returnSize = encodeToBytecode(this.createReturnInstructions()).length;

    // Estimate remaining ops based on available gas (rough approximation)
    // In other words, how many operations should we cram in after the loop?
    // TODO(dbanks12): setup gas may nneed to be computed
    const programSetupGas = this.config.setupGas || 0;
    const roughLoopGas = BoundedLoopSpammer.LOOP_ITERATIONS * this.config.gasPerOp; // without post-loop ops
    const availableForRemainingOps =
      AVM_MAX_PROCESSABLE_L2_GAS - programSetupGas - this.getLoopSetupGas() - roughLoopGas - this.getReturnGas();

    const estimatedRemainingOps = Math.floor(availableForRemainingOps / this.config.gasPerOp);

    // Estimate remaining ops bytecode size
    const singleOpSize = encodeToBytecode([this.config.createOperation()]).length;
    const remainingOpsSize = estimatedRemainingOps * singleOpSize;

    return returnSize + remainingOpsSize;
  }

  protected addLoopBody(availableSpace: number): {
    loopIterations: number;
    opsPerIteration: number;
    totalOps: number;
  } {
    // Calculate how many operations we can fit per iteration
    const loopControlSize = this.getLoopControlBytecodeSize();
    const spacePerIteration =
      (availableSpace - loopControlSize * BoundedLoopSpammer.LOOP_ITERATIONS) / BoundedLoopSpammer.LOOP_ITERATIONS;
    this.opsPerIteration = this.calculateOpsForSpace(spacePerIteration);

    // Ensure we don't exceed gas limit
    // TODO: Maybe do this during construction? In a create function?
    const maxOpsFromGas = this.calculateMaxOpsFromGas();
    this.opsPerIteration = Math.min(
      this.opsPerIteration,
      Math.floor(maxOpsFromGas / BoundedLoopSpammer.LOOP_ITERATIONS),
    );

    // Record loop start for jump
    const loopStartPc = encodeToBytecode(this.instructions).length;

    // Add loop body operations
    for (let i = 0; i < this.opsPerIteration; i++) {
      this.instructions.push(this.config.createOperation());
    }

    // Add loop control
    this.instructions.push(...this.createLoopControlInstructions(loopStartPc));

    return {
      loopIterations: BoundedLoopSpammer.LOOP_ITERATIONS,
      opsPerIteration: this.opsPerIteration,
      totalOps: BoundedLoopSpammer.LOOP_ITERATIONS * this.opsPerIteration + this.remainingOps,
    };
  }

  protected addExitInstructions(): void {
    // Calculate actual remaining gas after loop
    const loopGas = this.calculateLoopGas();
    const setupGas = this.config.setupGas || 0;
    const loopSetupGas = 3 * AVM_SET_BASE_L2_GAS;
    const returnGas = AVM_SET_BASE_L2_GAS + AVM_RETURN_BASE_L2_GAS;

    const availableForRemainingOps = AVM_MAX_PROCESSABLE_L2_GAS - setupGas - loopSetupGas - loopGas - returnGas;

    this.remainingOps = Math.max(0, Math.floor(availableForRemainingOps / this.config.gasPerOp));

    // Add remaining operations to consume gas
    for (let i = 0; i < this.remainingOps; i++) {
      this.instructions.push(this.config.createOperation());
    }

    // Add return
    this.instructions.push(...this.createReturnInstructions(RETURN_SIZE_OFFSET));
  }

  protected calculateTotalGas(_loopStats: { loopIterations?: number; opsPerIteration?: number }): number {
    const setupGas = this.config.setupGas || 0;
    const loopSetupGas = 3 * AVM_SET_BASE_L2_GAS;
    const loopGas = this.calculateLoopGas();
    const remainingOpsGas = this.remainingOps * this.config.gasPerOp;
    const exitGas = AVM_SET_BASE_L2_GAS + AVM_RETURN_BASE_L2_GAS;

    return setupGas + loopSetupGas + loopGas + remainingOpsGas + exitGas;
  }

  private calculateLoopGas(): number {
    const opsGas = BoundedLoopSpammer.LOOP_ITERATIONS * this.opsPerIteration * this.config.gasPerOp;
    const controlGas =
      BoundedLoopSpammer.LOOP_ITERATIONS * (AVM_ADD_BASE_L2_GAS + AVM_LT_BASE_L2_GAS + AVM_JUMPI_BASE_L2_GAS);
    return opsGas + controlGas;
  }

  private calculateMaxOpsFromGas(): number {
    const setupGas = this.config.setupGas || 0;
    const loopSetupGas = 3 * AVM_SET_BASE_L2_GAS;
    const returnGas = AVM_SET_BASE_L2_GAS + AVM_RETURN_BASE_L2_GAS;
    const loopControlGasPerIteration = AVM_ADD_BASE_L2_GAS + AVM_LT_BASE_L2_GAS + AVM_JUMPI_BASE_L2_GAS;

    const availableForOps =
      AVM_MAX_PROCESSABLE_L2_GAS -
      setupGas -
      loopSetupGas -
      returnGas -
      BoundedLoopSpammer.LOOP_ITERATIONS * loopControlGasPerIteration;

    return Math.floor(availableForOps / this.config.gasPerOp);
  }
}

/**
 * Builds a program with an infinite loop that maximizes bytecode usage.
 * The program will run until gas exhaustion.
 */
export class InfiniteLoopSpammer extends ProgramBuilder {
  protected getLoopSetupBytecodeSize(): number {
    // No loop setup needed for infinite loop
    return 0;
  }

  protected addLoopSetupInstructions(): void {
    // No loop setup for infinite loop
  }

  protected getLoopControlBytecodeSize(): number {
    // Just a single JUMP instruction
    return encodeToBytecode([new Jump(0).as(Opcode.JUMP_32, Jump.wireFormat)]).length;
  }

  protected getExitBytecodeSize(): number {
    // No exit for infinite loop
    return 0;
  }

  protected addLoopBody(availableSpace: number): {
    loopIterations: undefined;
    opsPerIteration: number;
    totalOps: undefined;
  } {
    // Calculate loop start PC.
    // Loop starts right after the setup instructions which
    // must be added before addLoopBody.
    const loopStartPc = encodeToBytecode(this.instructions).length;

    // Fill available space with operations
    const jumpSize = this.getLoopControlBytecodeSize();
    const opsPerIteration = this.calculateOpsForSpace(availableSpace - jumpSize);

    if (this.config.tester) {
      this.config.tester.logger.debug(
        `[${this.config.opcodeName}] Infinite loop with ${opsPerIteration} operations per iteration`,
      );
    }

    // Add operations
    for (let i = 0; i < opsPerIteration; i++) {
      this.instructions.push(this.config.createOperation());
    }

    // Add jump back to loop start
    this.instructions.push(new Jump(loopStartPc).as(Opcode.JUMP_32, Jump.wireFormat));

    return {
      loopIterations: undefined, // Infinite
      opsPerIteration,
      totalOps: undefined, // Infinite
    };
  }

  protected addExitInstructions(): void {
    // No exit for infinite loop - runs until gas exhaustion
  }

  protected calculateTotalGas(_loopStats: { opsPerIteration?: number }): number {
    // Will consume all available gas
    return AVM_MAX_PROCESSABLE_L2_GAS;
  }
}
