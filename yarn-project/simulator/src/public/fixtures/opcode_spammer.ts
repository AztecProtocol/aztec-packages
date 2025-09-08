import {
  AVM_ADD_BASE_L2_GAS,
  AVM_JUMPI_BASE_L2_GAS,
  AVM_LT_BASE_L2_GAS,
  AVM_MAX_PROCESSABLE_L2_GAS,
  AVM_RETURN_BASE_L2_GAS,
  AVM_SET_BASE_L2_GAS,
  MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS,
} from '@aztec/constants';
import { randomBoolean, randomInt } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { FunctionType, emptyContractArtifact, emptyFunctionArtifact } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { TypeTag } from '../avm/avm_memory_types.js';
import { Add, Instruction, Jump, JumpI, Lt, Return, Set } from '../avm/opcodes/index.js';
import { encodeToBytecode } from '../avm/serialization/bytecode_serialization.js';
import { Opcode } from '../avm/serialization/instruction_serialization.js';
import type { PublicTxResult } from '../public_tx_simulator/public_tx_simulator.js';
import type { PublicTxSimulationTester } from './public_tx_simulation_tester.js';

const LOOP_COUNTER_OFFSET = 10000;
const LOOP_LIMIT_OFFSET = 10001;
const LOOP_TEMP_OFFSET = 10002;
/**
 * A range of memory addresses with a fixed type tag.
 */
export interface MemoryRange {
  /** Number of consecutive values to initialize */
  size: number;
  /** Type tag for all values in this range */
  typeTag: TypeTag;
}

export interface OpcodeSpamConfig {
  /** The opcode name to spam */
  opcodeName: string;
  /** The opcode instruction to spam */
  createInstruction: () => Instruction;
  /** Gas cost per operation */
  gasPerOp: number;
  /** Memory ranges to initialize with random values */
  inputRanges?: MemoryRange[];
  /** Additional memory ranges for output space (not initialized with values) */
  outputRanges?: MemoryRange[];
  /** Setup instructions to initialize memory before spamming (advanced usage). Can only be used INSTEAD of inputRanges. */
  setupInstructions?: Instruction[];
  /** Gas cost for setup instructions. Needed iff using setupInstructions instead of inputRanges. */
  setupGas?: number;
  /** If true, use infinite loop until gas runs out instead of bounded loop */
  useInfiniteLoop?: boolean;
}

/**
 * A flexible opcode spammer that generates a program to run a given opcode as
 * many times as possible.
 *
 * There are three modes:
 * 1. Direct: includes the opcode several times in the bytecode without the need for a loop.
 *     - Can be used for operations that can only be run a small number of times before running out of gas.
 * 2. Bounded loop: runs up until just before it would run out of gas and return successfully.
 * 3. Infinite loop: runs an infinite loop until gas runs out.
 *     - This has less overhead than the bounded loop, but with bounded loops, we can confirm "success".
 *
 * Modes 1 and 2 almost serve as "fuzzing" tests in that they can be used to generate lengthy programs that
 * operate on somewhat random data and SHOULD succeed.
 *
 * Mode 3 is best for spamming an opcode as many times as possible, since it minimizes loop overhead with just
 * one JUMP instruction and no conditional and increment logic.
 */
export class OpcodeSpammer {
  // Bytecode size limit: The bufferAsFields function adds 1 length field, then packs 31 bytes per field
  // So we have: 1 length field + 2999 data fields = 3000 total fields
  // Maximum bytecode size = 2999 * 31 = 92969 bytes
  private static readonly MAX_BYTECODE_SIZE_IN_BYTES = (MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS - 1) * 31;

  // Loop control gas costs
  private static readonly LOOP_SETUP_GAS = 3 * AVM_SET_BASE_L2_GAS;
  private static readonly BOUNDED_LOOP_ITERATION_GAS_OVERHEAD =
    AVM_ADD_BASE_L2_GAS + AVM_LT_BASE_L2_GAS + AVM_JUMPI_BASE_L2_GAS;

  // Loop control bytecode overhead
  // Infinite loop has just one JUMP per iteration
  private static readonly INFINITE_LOOP_CONTROL_INSTRUCTIONS = [new Jump(0).as(Opcode.JUMP_32, Jump.wireFormat)];
  private static readonly INFINITE_LOOP_CONTROL_BYTECODE_OVERHEAD = encodeToBytecode(
    this.INFINITE_LOOP_CONTROL_INSTRUCTIONS,
  ).length;

  private static readonly BOUNDED_LOOP_CONTROL_INSTRUCTIONS = [
    new Add(0, LOOP_COUNTER_OFFSET, LOOP_TEMP_OFFSET, LOOP_COUNTER_OFFSET).as(Opcode.ADD_16, Add.wireFormat16),
    new Lt(0, LOOP_COUNTER_OFFSET, LOOP_LIMIT_OFFSET, LOOP_TEMP_OFFSET + 1).as(Opcode.LT_16, Lt.wireFormat16),
    new JumpI(0, LOOP_TEMP_OFFSET + 1, 0).as(Opcode.JUMPI_32, JumpI.wireFormat),
  ];

  private static readonly BOUNDED_LOOP_CONTROL_BYTECODE_OVERHEAD = encodeToBytecode(
    this.BOUNDED_LOOP_CONTROL_INSTRUCTIONS,
  ).length;

  private static readonly BOUNDED_LOOP_RETURN_INSTRUCTIONS = [
    new Set(0, 0, TypeTag.UINT32, 0).as(Opcode.SET_8, Set.wireFormat8),
    new Return(0, 0, 0).as(Opcode.RETURN, Return.wireFormat),
  ];
  private static readonly BOUNDED_LOOP_RETURN_BYTECODE_OVERHEAD = encodeToBytecode(
    this.BOUNDED_LOOP_RETURN_INSTRUCTIONS,
  ).length;

  private static readonly LOOP_SETUP_INSTRUCTIONS = [
    new Set(0, LOOP_COUNTER_OFFSET, TypeTag.UINT32, 0).as(Opcode.SET_32, Set.wireFormat32),
    new Set(0, LOOP_LIMIT_OFFSET, TypeTag.UINT32, 1).as(Opcode.SET_32, Set.wireFormat32),
    new Set(0, LOOP_TEMP_OFFSET, TypeTag.UINT32, 1).as(Opcode.SET_32, Set.wireFormat32),
  ];
  private static readonly LOOP_SETUP_BYTECODE_OVERHEAD = encodeToBytecode(this.LOOP_SETUP_INSTRUCTIONS).length;

  /**
   * Creates a spam contract for the given opcode configuration using bounded loops.
   */
  static createSpamInstructions(config: OpcodeSpamConfig, tester: PublicTxSimulationTester): Instruction[] {
    if (config.useInfiniteLoop) {
      return this.createInfiniteSpamInstructions(config, tester);
    }

    const instructions: Instruction[] = [];

    // Add setup instructions - either from memory ranges or explicit instructions
    let setupInstructions: Instruction[] = [];
    if (config.inputRanges) {
      setupInstructions = generateMemoryInitializationInstructions(config.inputRanges);
      instructions.push(...setupInstructions);
    } else if (config.setupInstructions) {
      setupInstructions = config.setupInstructions;
      instructions.push(...setupInstructions);
    }

    // Calculate setup gas based on configuration
    let setupGas = 0;
    if (config.setupInstructions !== undefined) {
      // setupInstructions provided - setupGas must be explicitly provided
      if (config.setupGas === undefined) {
        throw new Error('setupGas must be provided if setupInstructions are provided');
      }
      setupGas = config.setupGas;
    } else if (config.inputRanges) {
      // inputRanges provided - calculate setupGas automatically
      const totalInputSize = config.inputRanges.reduce((sum, range) => sum + range.size, 0);
      setupGas = totalInputSize * AVM_SET_BASE_L2_GAS;
    } else {
      // Neither setupInstructions nor inputRanges - no setup needed
      setupGas = 0;
    }
    const availableGas = AVM_MAX_PROCESSABLE_L2_GAS - setupGas - AVM_RETURN_BASE_L2_GAS;

    tester.logger.debug(`[${config.opcodeName}] Setup gas: ${setupGas}`);
    tester.logger.debug(`[${config.opcodeName}] Available gas for operations: ${availableGas}`);

    // Calculate maximum operations for bounded loop
    const maxOps = this.calculateMaxOperations(availableGas, config.gasPerOp, tester, config.opcodeName);

    // TODO(dbanks12): consider having this fn return the number of core spam operations
    // and the number of total instructions (including loop overhead) so it can be reported
    // by the caller.
    tester.logger.warn(`Spamming ${maxOps} ${config.opcodeName} operations (max allowed: ${maxOps})`);

    // Add the spam operations
    this.addSpamOperations(instructions, maxOps, config.createInstruction, tester, config.opcodeName);

    // Find a safe offset for return size (after all our memory ranges)
    const returnSizeOffset = this.findSafeMemoryOffset(config);

    // Set up return size of 0 at a safe offset
    instructions.push(new Set(0, returnSizeOffset, TypeTag.UINT32, 0).as(Opcode.SET_8, Set.wireFormat8));

    // Add return instruction (return size at returnSizeOffset, return data at offset 0)
    instructions.push(new Return(0, returnSizeOffset, 0).as(Opcode.RETURN, Return.wireFormat));

    // Log final gas estimate
    const loopOverhead = this.calculateLoopGasOverhead(maxOps);
    const setGas = AVM_SET_BASE_L2_GAS; // Gas for the Set instruction
    const totalGas = setupGas + maxOps * config.gasPerOp + loopOverhead + setGas + AVM_RETURN_BASE_L2_GAS;
    tester.logger.debug(`[${config.opcodeName}] Final instruction count: ${instructions.length}`);
    tester.logger.debug(`[${config.opcodeName}] Estimated total gas: ${totalGas}`);

    return instructions;
  }

  /**
   * Creates a spam contract that runs an infinite loop until gas exhaustion.
   * Minimizes JUMP overhead by filling the loop body with as many operations as possible.
   */
  static createInfiniteSpamInstructions(config: OpcodeSpamConfig, tester: PublicTxSimulationTester): Instruction[] {
    const instructions: Instruction[] = [];

    tester.logger.verbose(`Creating infinite ${config.opcodeName} spam - will run until gas exhaustion`);

    // Add setup instructions - either from memory ranges or explicit instructions
    if (config.inputRanges) {
      instructions.push(...generateMemoryInitializationInstructions(config.inputRanges));
    } else if (config.setupInstructions) {
      instructions.push(...config.setupInstructions);
    }

    // Calculate current bytecode size after setup
    const currentBytecodeSize = encodeToBytecode(instructions).length;

    // Calculate maximum operations that can fit
    const maxOpsPerLoop = this.calculateMaxOpsPerLoop(
      config,
      currentBytecodeSize,
      this.INFINITE_LOOP_CONTROL_BYTECODE_OVERHEAD,
      tester,
    );

    tester.logger.debug(`[${config.opcodeName}] Operations per loop iteration: ${maxOpsPerLoop}`);
    tester.logger.debug(`[${config.opcodeName}] This minimizes JUMP overhead to 1 per ${maxOpsPerLoop} operations`);

    // Need to encode here to figure out the loop start PC
    const loopStartPc = currentBytecodeSize;

    // Fill loop body with operations
    for (let i = 0; i < maxOpsPerLoop; i++) {
      instructions.push(config.createInstruction());
    }

    // Unconditional jump back to start (creates infinite loop)
    instructions.push(new Jump(loopStartPc).as(Opcode.JUMP_32, Jump.wireFormat));

    tester.logger.debug(`[${config.opcodeName}] Infinite loop: ${instructions.length} instructions total`);
    tester.logger.debug(
      `[${config.opcodeName}] Loop jumps back to PC ${loopStartPc} after ${maxOpsPerLoop} operations`,
    );
    tester.logger.debug(`[${config.opcodeName}] Will run until gas exhaustion (no return instruction)`);

    // Log bytecode size
    const bytecode = encodeToBytecode(instructions);
    tester.logger.debug(
      `[${config.opcodeName}] Bytecode size: ${bytecode.length} bytes (${Math.round((bytecode.length * 100) / this.MAX_BYTECODE_SIZE_IN_BYTES)}% of max)`,
    );

    return instructions;
  }

  /**
   * Calculates the maximum number of operations that can fit in a loop body
   * given bytecode size constraints.
   */
  private static calculateMaxOpsPerLoop(
    config: OpcodeSpamConfig,
    currentBytecodeSize: number,
    loopOverheadSize: number,
    tester: PublicTxSimulationTester,
  ): number {
    // Calculate the size of a single operation
    const singleOp = config.createInstruction();
    const singleOpSize = encodeToBytecode([singleOp]).length;

    // Calculate available space for operations
    const availableSpace = this.MAX_BYTECODE_SIZE_IN_BYTES - currentBytecodeSize - loopOverheadSize;

    // Calculate how many operations can fit
    const maxOps = Math.floor(availableSpace / singleOpSize);

    tester.logger.debug(`[${config.opcodeName}] Single operation size: ${singleOpSize} bytes`);
    tester.logger.debug(`[${config.opcodeName}] Available space for operations: ${availableSpace} bytes`);
    tester.logger.debug(`[${config.opcodeName}] Maximum operations that fit: ${maxOps}`);

    return maxOps;
  }

  /**
   * Finds a safe memory offset after all configured memory ranges.
   * This ensures we don't overwrite any memory used by the opcode operations.
   */
  private static findSafeMemoryOffset(config: OpcodeSpamConfig): number {
    let maxOffset = 0;

    // Find the highest offset used by memory ranges
    if (config.inputRanges) {
      let currentOffset = 0;
      for (const range of config.inputRanges) {
        currentOffset += range.size;
      }
      maxOffset = Math.max(maxOffset, currentOffset);
    }

    // Find the highest offset used by output ranges
    if (config.outputRanges) {
      let currentOffset = 0;
      for (const range of config.outputRanges) {
        currentOffset += range.size;
      }
      maxOffset = Math.max(maxOffset, currentOffset);
    }

    // Return a safe offset with some padding
    return maxOffset + 10;
  }

  /**
   * Calculates the maximum number of operations that can fit within the gas limit.
   * This accounts for both gas and bytecode size constraints.
   */
  private static calculateMaxOperations(
    availableGas: number,
    gasPerOp: number,
    tester: PublicTxSimulationTester,
    opName: string,
  ): number {
    // Account for the Set instruction gas when calculating max operations
    const setGas = AVM_SET_BASE_L2_GAS;
    const availableForLoop = availableGas - setGas;

    // First check how many operations we could do without any loop overhead (gas constraint)
    const maxWithoutLoopGas = Math.floor(availableForLoop / gasPerOp);

    tester.logger.debug(`[${opName}] Gas per operation: ${gasPerOp}`);
    tester.logger.debug(`[${opName}] Max operations without loop overhead (gas): ${maxWithoutLoopGas}`);

    // Now check bytecode size constraint
    // We need to estimate based on the operation size
    // This is a simplified estimate - actual calculation happens in addSpamOperations
    const sampleOp = new Add(0, 0, 0, 0).as(Opcode.ADD_16, Add.wireFormat16); // Use a typical operation for size estimate
    const singleOpSize = encodeToBytecode([sampleOp]).length;
    const setupAndReturnSize = 100; // Rough estimate for setup and return instructions
    const availableForOps = this.MAX_BYTECODE_SIZE_IN_BYTES - setupAndReturnSize;
    const maxOpsFromBytecodeSize = Math.floor(availableForOps / singleOpSize);

    tester.logger.debug(`[${opName}] Max operations from bytecode size limit: ${maxOpsFromBytecodeSize}`);

    // Take the minimum of gas and bytecode size constraints
    const maxOps = Math.min(maxWithoutLoopGas, maxOpsFromBytecodeSize);

    tester.logger.debug(`[${opName}] Final max operations (min of gas and bytecode constraints): ${maxOps}`);

    return maxOps;
  }

  /**
   * Adds spam operations to the instruction array, using loops efficiently.
   */
  private static addSpamOperations(
    instructions: Instruction[],
    numOperations: number,
    createOperation: () => Instruction,
    tester: PublicTxSimulationTester,
    opName: string,
  ): void {
    // Calculate current bytecode size
    const currentSize = encodeToBytecode(instructions).length;

    // Account for return instruction that will be added later

    // Calculate max operations per loop iteration
    const availableForLoop =
      this.MAX_BYTECODE_SIZE_IN_BYTES -
      currentSize -
      this.BOUNDED_LOOP_RETURN_BYTECODE_OVERHEAD -
      this.LOOP_SETUP_BYTECODE_OVERHEAD -
      this.BOUNDED_LOOP_CONTROL_BYTECODE_OVERHEAD;
    const singleOpSize = encodeToBytecode([createOperation()]).length;
    const maxOpsPerIteration = Math.floor(availableForLoop / singleOpSize);

    // If we can fit all operations without a loop, do so
    if (numOperations <= maxOpsPerIteration) {
      tester.logger.debug(
        `[${opName}] No loop needed for ${numOperations} operations (can fit ${maxOpsPerIteration} without loop)`,
      );
      for (let i = 0; i < numOperations; i++) {
        instructions.push(createOperation());
      }
      return;
    }

    // We need a loop - calculate optimal operations per iteration
    // We want to maximize ops per iteration to minimize total iterations
    const opsPerIteration = Math.min(maxOpsPerIteration, numOperations);
    const iterations = Math.ceil(numOperations / opsPerIteration);

    tester.logger.verbose(
      `[${opName}] Using loop: ${iterations} iterations of ${opsPerIteration} ops each (${iterations * opsPerIteration} total operations)`,
    );
    tester.logger.debug(`[${opName}] Maximized ops per iteration to ${opsPerIteration} to minimize loop overhead`);

    // Initialize loop variables
    instructions.push(
      // Counter = 0
      new Set(0, LOOP_COUNTER_OFFSET, TypeTag.UINT32, 0).as(Opcode.SET_32, Set.wireFormat32),
      // Limit = iterations
      new Set(0, LOOP_LIMIT_OFFSET, TypeTag.UINT32, iterations).as(Opcode.SET_32, Set.wireFormat32),
      // Increment value = 1
      new Set(0, LOOP_TEMP_OFFSET, TypeTag.UINT32, 1).as(Opcode.SET_32, Set.wireFormat32),
    );

    // Calculate loop start PC
    const loopStartPc = encodeToBytecode(instructions).length;

    // Main loop body - add as many operations as we calculated
    for (let i = 0; i < opsPerIteration; i++) {
      instructions.push(createOperation());
    }

    // Increment counter
    instructions.push(
      new Add(0, LOOP_COUNTER_OFFSET, LOOP_TEMP_OFFSET, LOOP_COUNTER_OFFSET).as(Opcode.ADD_16, Add.wireFormat16),
    );

    // Check if counter < limit (result goes to a separate location for UINT1)
    instructions.push(
      new Lt(0, LOOP_COUNTER_OFFSET, LOOP_LIMIT_OFFSET, LOOP_TEMP_OFFSET + 1).as(Opcode.LT_16, Lt.wireFormat16),
    );

    // Conditional jump back to loop start
    instructions.push(new JumpI(0, LOOP_TEMP_OFFSET + 1, loopStartPc).as(Opcode.JUMPI_32, JumpI.wireFormat));
  }

  /**
   * Calculates the loop overhead gas for a given number of operations.
   * Note: This is an estimate since actual ops per iteration is calculated dynamically.
   */
  private static calculateLoopGasOverhead(numOperations: number, opsPerIteration: number = 1000): number {
    if (numOperations <= opsPerIteration) {
      return 0;
    }

    // We calculate based on complete iterations only
    const iterations = Math.floor(numOperations / opsPerIteration);
    return this.LOOP_SETUP_GAS + iterations * this.BOUNDED_LOOP_ITERATION_GAS_OVERHEAD;
  }

  /**
   * Convenient method to create and execute an infinite spam contract.
   */
  static async executeInfiniteSpam(
    config: OpcodeSpamConfig,
    tester: PublicTxSimulationTester,
    contractName?: string,
  ): Promise<PublicTxResult> {
    const name = contractName || `Infinite${config.opcodeName}SpamContract`;
    const instructions = this.createInfiniteSpamInstructions(config, tester);
    return await this.executeAsContract(tester, name, instructions);
  }

  /**
   * Executes instructions as a contract in the public tx simulator.
   */
  static async executeAsContract(
    tester: PublicTxSimulationTester,
    name: string,
    instructions: Instruction[],
  ): Promise<PublicTxResult> {
    const deployer = AztecAddress.fromNumber(42);
    const bytecode = encodeToBytecode(instructions);

    const contractArtifact = emptyContractArtifact();
    contractArtifact.name = name;
    contractArtifact.functions = [emptyFunctionArtifact()];
    contractArtifact.functions[0].name = 'public_dispatch';
    contractArtifact.functions[0].functionType = FunctionType.PUBLIC;
    contractArtifact.functions[0].bytecode = bytecode;

    const contractInstance = await tester.registerAndDeployContract([], deployer, contractArtifact);

    return await tester.executeTxWithLabel(
      name,
      deployer,
      [],
      [
        {
          address: contractInstance.address,
          fnName: 'public_dispatch',
          args: [],
        },
      ],
    );
  }
}

/**
 * Generates an appropriate random value for the given type tag, avoiding 0 to prevent div-by-zero
 */
function generateRandomValue(typeTag: TypeTag): number | bigint {
  switch (typeTag) {
    case TypeTag.UINT1:
      return randomBoolean() ? 1 : 0;
    case TypeTag.UINT8:
      return randomInt(2 ** 8);
    case TypeTag.UINT16:
      return randomInt(2 ** 16);
    case TypeTag.UINT32:
      return randomInt(2 ** 32);
    case TypeTag.UINT64:
      return Fr.random().toBigInt() % 2n ** 64n;
    case TypeTag.UINT128:
      return Fr.random().toBigInt() % 2n ** 128n;
    case TypeTag.FIELD:
      return Fr.random().toBigInt();
    default:
      throw new Error(`Unsupported type tag for random value generation: ${TypeTag[typeTag]}`);
  }
}

function generateRandomSetInstruction(offset: number, typeTag: TypeTag): Instruction {
  const value = generateRandomValue(typeTag);
  // Choose the smallest opcode and wire format based on the TYPE TAG.
  // Note that technically we could choose this based on the VALUE, but then
  // the actual bytecode structure would be different based on the randomly chosen values,
  // which would make it harder to replicate bugs.
  let opcode = Opcode.SET_FF;
  let wireFormat = Set.wireFormatFF;
  if (typeTag === TypeTag.UINT1 || typeTag === TypeTag.UINT8) {
    opcode = Opcode.SET_8;
    wireFormat = Set.wireFormat8;
  } else if (typeTag === TypeTag.UINT16) {
    opcode = Opcode.SET_16;
    wireFormat = Set.wireFormat16;
  } else if (typeTag === TypeTag.UINT32) {
    opcode = Opcode.SET_32;
    wireFormat = Set.wireFormat32;
  } else if (typeTag === TypeTag.UINT64) {
    opcode = Opcode.SET_64;
    wireFormat = Set.wireFormat64;
  } else if (typeTag === TypeTag.UINT128) {
    opcode = Opcode.SET_128;
    wireFormat = Set.wireFormat128;
  }
  return new Set(0, offset, typeTag, value).as(opcode, wireFormat);
}

/**
 * Generates some SET instructions to populate the provided memory ranges with random values of the right types.
 * Ranges are placed consecutively starting from memory address 0. A given memory range has a fixed type tag.
 * Input ranges are initialized with random values, output ranges are just allocated (no initialization).
 */
function generateMemoryInitializationInstructions(
  memoryRanges: MemoryRange[], // one type per range
  startMemoryAddress: number = 0,
): Instruction[] {
  const instructions: Instruction[] = [];
  let currentAddress = startMemoryAddress;

  // Initialize input ranges with random values
  for (const range of memoryRanges) {
    // Initialize each memory address in the range
    instructions.push(
      ...Array(range.size)
        .keys()
        .map(i => generateRandomSetInstruction(currentAddress + i, range.typeTag)),
    );
    // Move to the next range's starting position
    currentAddress += range.size;
  }

  return instructions;
}
