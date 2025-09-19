import { AVM_SET_BASE_L2_GAS } from '@aztec/constants';
import { randomBoolean, randomInt } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { TypeTag } from '../avm/avm_memory_types.js';
import { Instruction, Set } from '../avm/opcodes/index.js';
import { encodeToBytecode } from '../avm/serialization/bytecode_serialization.js';
import { Opcode } from '../avm/serialization/instruction_serialization.js';
import type { PublicTxResult } from '../public_tx_simulator/public_tx_simulator.js';
import { BoundedLoopSpammer, InfiniteLoopSpammer, ProgramBuildConfig } from './program_builder.js';
import type { PublicTxSimulationTester } from './public_tx_simulation_tester.js';

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
 * Opcode spammer using the new ProgramBuilder architecture.
 * Creates contracts that spam a specific opcode either in a bounded loop
 * (that exits cleanly) or an infinite loop (that runs until gas exhaustion).
 */
export class OpcodeSpammer {
  /**
   * Creates a spam contract for the given opcode configuration.
   */
  static createSpamContract(config: OpcodeSpamConfig, tester?: PublicTxSimulationTester) {
    // Prepare setup instructions
    const setupInstructions = config.setupInstructions || this.createMemoryInitInstructions(config.inputRanges);
    const setupGas = config.setupGas ?? this.calculateSetupGas(config.inputRanges);

    // Create ProgramBuildConfig
    const buildConfig: ProgramBuildConfig = {
      opcodeName: config.opcodeName,
      createOperation: config.createInstruction,
      gasPerOp: config.gasPerOp,
      setupInstructions,
      setupGas,
      tester,
    };

    // Choose builder based on loop type
    const builder = config.useInfiniteLoop ? new InfiniteLoopSpammer(buildConfig) : new BoundedLoopSpammer(buildConfig);

    // Build the program
    return builder.build();
  }

  /**
   * Executes a spam contract in the public tx simulator.
   */
  static async executeSpamContract(
    config: OpcodeSpamConfig,
    tester: PublicTxSimulationTester,
    contractName?: string,
  ): Promise<PublicTxResult> {
    const result = this.createSpamContract(config, tester);
    const name = contractName || `${config.opcodeName}SpamContract`;

    // Deploy and execute
    const deployer = AztecAddress.fromNumber(42);
    const contractInstance = await tester.registerAndDeployContract([], deployer, result.artifact);

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

  /**
   * Create memory initialization instructions from memory ranges
   */
  private static createMemoryInitInstructions(ranges?: MemoryRange[]): Instruction[] {
    if (!ranges || ranges.length === 0) {
      return [];
    }

    const instructions: Instruction[] = [];
    let currentAddress = 0;

    for (const range of ranges) {
      for (let i = 0; i < range.size; i++) {
        const value = this.generateRandomValue(range.typeTag);
        const instruction = this.createSetInstruction(currentAddress + i, range.typeTag, value);
        instructions.push(instruction);
      }
      currentAddress += range.size;
    }

    return instructions;
  }

  /**
   * Calculate gas cost for setup instructions
   */
  private static calculateSetupGas(ranges?: MemoryRange[]): number {
    if (!ranges || ranges.length === 0) {
      return 0;
    }

    const totalSize = ranges.reduce((sum, range) => sum + range.size, 0);
    return totalSize * AVM_SET_BASE_L2_GAS;
  }

  /**
   * Generate a random value for the given type tag
   */
  private static generateRandomValue(typeTag: TypeTag): number | bigint {
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

  /**
   * Create a SET instruction for the given offset and type
   */
  private static createSetInstruction(offset: number, typeTag: TypeTag, value: number | bigint): Instruction {
    // Choose the smallest opcode and wire format based on the TYPE TAG
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
   * Find a safe memory offset after all configured memory ranges.
   * This ensures we don't overwrite any memory used by the opcode operations.
   */
  static findSafeMemoryOffset(config: OpcodeSpamConfig): number {
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
}
