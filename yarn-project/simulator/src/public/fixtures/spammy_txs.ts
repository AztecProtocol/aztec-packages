import {
  AVM_ADD_BASE_L2_GAS,
  AVM_BITWISE_DYN_L2_GAS,
  AVM_DIV_BASE_L2_GAS,
  AVM_JUMPI_BASE_L2_GAS,
  AVM_KECCAKF1600_BASE_L2_GAS,
  AVM_LT_BASE_L2_GAS,
  AVM_MAX_PROCESSABLE_L2_GAS,
  AVM_POSEIDON2_BASE_L2_GAS,
  AVM_RETURN_BASE_L2_GAS,
  AVM_SET_BASE_L2_GAS,
  AVM_SHA256COMPRESSION_BASE_L2_GAS,
  AVM_XOR_BASE_L2_GAS,
} from '@aztec/constants';
import { Timer } from '@aztec/foundation/timer';
import { FunctionType, emptyContractArtifact, emptyFunctionArtifact } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { TypeTag } from '../avm/avm_memory_types.js';
import {
  Add,
  Div,
  Instruction,
  JumpI,
  KeccakF1600,
  Lt,
  Poseidon2,
  Return,
  Set,
  Sha256Compression,
  Xor,
} from '../avm/opcodes/index.js';
import { encodeToBytecode } from '../avm/serialization/bytecode_serialization.js';
import { Opcode } from '../avm/serialization/instruction_serialization.js';
import type { PublicTxResult } from '../public_tx_simulator/public_tx_simulator.js';
import { PublicTxSimulationTester } from './public_tx_simulation_tester.js';

const SET_AND_RETURN_GAS = AVM_SET_BASE_L2_GAS + AVM_RETURN_BASE_L2_GAS; // SET for copySize + RETURN

// Memory offsets for loop control when using loops
const LOOP_COUNTER_OFFSET = 10000; // Memory offset for loop counter
const LOOP_LIMIT_OFFSET = 10001; // Memory offset for loop limit
const LOOP_TEMP_OFFSET = 10002; // Memory offset for temporary values in loop
const LOOP_OPS_PER_ITERATION = 1000; // Operations per loop iteration

// Gas costs for loop control instructions
// Using SET_32 for all loop variables (can handle large offsets and iteration counts)
const LOOP_SETUP_GAS = 3 * AVM_SET_BASE_L2_GAS; // 3 SET_32 instructions for counter, limit, and increment
// Using ADD_16 and LT_16 for loop operations (same gas cost as _8 variants)
const LOOP_ITERATION_OVERHEAD_GAS = AVM_ADD_BASE_L2_GAS + AVM_LT_BASE_L2_GAS + AVM_JUMPI_BASE_L2_GAS; // ADD + LT + JUMPI per iteration

// Safety margin to avoid edge cases where we might run out of gas
const GAS_SAFETY_MARGIN = 10000; // Increased margin to be safe

/**
 * Calculate the maximum number of operations that can be executed given gas constraints.
 * Takes into account loop overhead if operations will be executed in a loop.
 *
 * @param availableGas - Total gas available for operations
 * @param gasPerOp - Gas cost per operation
 * @param tester - Logger for debug output
 * @param opName - Name of the operation for logging
 * @returns Maximum number of operations that can be executed
 */
function calculateMaxOperationsWithLoopOverhead(
  availableGas: number,
  gasPerOp: number,
  tester?: PublicTxSimulationTester,
  opName?: string,
): number {
  // First check how many operations we could do without any loop overhead
  const maxWithoutLoop = Math.floor(availableGas / gasPerOp);

  if (tester && opName) {
    tester.logger.debug(`[${opName}] Available gas for operations: ${availableGas}`);
    tester.logger.debug(`[${opName}] Gas per operation: ${gasPerOp}`);
    tester.logger.debug(`[${opName}] Max operations without loop overhead: ${maxWithoutLoop}`);
  }

  // If we can fit everything without a loop (≤1000 ops), return that
  if (maxWithoutLoop <= LOOP_OPS_PER_ITERATION) {
    if (tester && opName) {
      tester.logger.debug(
        `[${opName}] Can fit ${maxWithoutLoop} operations without loop (threshold is ${LOOP_OPS_PER_ITERATION})`,
      );
    }
    return maxWithoutLoop;
  }

  // We need a loop, so recalculate accounting for loop overhead
  // Total gas = LOOP_SETUP_GAS + numIterations * (LOOP_OPS_PER_ITERATION * gasPerOp + LOOP_ITERATION_OVERHEAD_GAS)
  const gasAfterSetup = availableGas - LOOP_SETUP_GAS;
  if (gasAfterSetup <= 0) {
    if (tester && opName) {
      tester.logger.debug(`[${opName}] Cannot afford loop setup (needs ${LOOP_SETUP_GAS} gas)`);
    }
    return 0;
  }

  const gasPerIteration = LOOP_OPS_PER_ITERATION * gasPerOp + LOOP_ITERATION_OVERHEAD_GAS;
  const maxIterations = Math.floor(gasAfterSetup / gasPerIteration);
  const totalOps = maxIterations * LOOP_OPS_PER_ITERATION;

  if (tester && opName) {
    tester.logger.debug(`[${opName}] Need loop for ${maxWithoutLoop} operations`);
    tester.logger.debug(`[${opName}] Gas after loop setup: ${gasAfterSetup}`);
    tester.logger.debug(
      `[${opName}] Gas per iteration: ${gasPerIteration} (${LOOP_OPS_PER_ITERATION} × ${gasPerOp} + ${LOOP_ITERATION_OVERHEAD_GAS})`,
    );
    tester.logger.debug(`[${opName}] Max iterations: ${maxIterations}`);
    tester.logger.debug(`[${opName}] Total operations with loop: ${totalOps}`);
    const totalGasUsed = LOOP_SETUP_GAS + maxIterations * gasPerIteration;
    tester.logger.debug(`[${opName}] Total gas to be used: ${totalGasUsed} (available: ${availableGas})`);
  }

  return totalOps;
}

/**
 * Helper function to add loop-based spamming of operations.
 * @param instructions - The instruction array to append to
 * @param numOperations - Total number of operations to spam
 * @param createOperation - Function that creates a single operation instruction
 * @param tester - Logger for verbose output
 * @param opName - Name of the operation for logging
 */
function addSpamOperationsWithLoop(
  instructions: Instruction[],
  numOperations: number,
  createOperation: () => Instruction,
  tester: PublicTxSimulationTester,
  opName: string,
): void {
  // If we need more than LOOP_OPS_PER_ITERATION operations, use a loop
  if (numOperations > LOOP_OPS_PER_ITERATION) {
    const numIterations = Math.ceil(numOperations / LOOP_OPS_PER_ITERATION);

    // Initialize loop counter, limit, and increment value
    instructions.push(
      new Set(/*indirect=*/ 0, /*dstOffset=*/ LOOP_COUNTER_OFFSET, TypeTag.UINT32, /*value=*/ 0).as(
        Opcode.SET_32,
        Set.wireFormat32,
      ),
      new Set(/*indirect=*/ 0, /*dstOffset=*/ LOOP_LIMIT_OFFSET, TypeTag.UINT32, /*value=*/ numIterations).as(
        Opcode.SET_32,
        Set.wireFormat32,
      ),
      new Set(/*indirect=*/ 0, /*dstOffset=*/ LOOP_TEMP_OFFSET, TypeTag.UINT32, /*value=*/ 1).as(
        Opcode.SET_32,
        Set.wireFormat32,
      ), // For incrementing
    );

    // to compute loop start pc, we need to figure out the number of bytes so far, so encode for this purpose
    const loopStartPc = encodeToBytecode(instructions).length;

    // Main loop body - spam operations
    for (let i = 0; i < LOOP_OPS_PER_ITERATION; i++) {
      instructions.push(createOperation());
    }

    // Increment counter
    instructions.push(
      new Add(
        /*indirect=*/ 0,
        /*aOffset=*/ LOOP_COUNTER_OFFSET,
        /*bOffset=*/ LOOP_TEMP_OFFSET,
        /*dstOffset=*/ LOOP_COUNTER_OFFSET,
      ).as(Opcode.ADD_16, Add.wireFormat16),
    );

    // Check if counter < limit
    instructions.push(
      new Lt(
        /*indirect=*/ 0,
        /*aOffset=*/ LOOP_COUNTER_OFFSET,
        /*bOffset=*/ LOOP_LIMIT_OFFSET,
        /*dstOffset=*/ LOOP_TEMP_OFFSET + 1, // Use different location for condition result
      ).as(Opcode.LT_16, Lt.wireFormat16),
    );

    // Conditional jump back to loop start
    instructions.push(
      new JumpI(/*indirect=*/ 0, /*condOffset=*/ LOOP_TEMP_OFFSET + 1, /*loc=*/ loopStartPc).as(
        Opcode.JUMPI_32,
        JumpI.wireFormat,
      ),
    );

    tester.logger.verbose(`Using loop with ${numIterations} iterations of ${LOOP_OPS_PER_ITERATION} ${opName}s each`);
    tester.logger.debug(
      `Loop structure: ${numIterations} iterations × ${LOOP_OPS_PER_ITERATION} ops/iteration = ${numIterations * LOOP_OPS_PER_ITERATION} total ${opName}s`,
    );
    tester.logger.debug(
      `Loop gas breakdown: ${LOOP_SETUP_GAS} (setup) + ${numIterations} × ${LOOP_ITERATION_OVERHEAD_GAS} (overhead) = ${LOOP_SETUP_GAS + numIterations * LOOP_ITERATION_OVERHEAD_GAS} total loop overhead`,
    );
  } else {
    // Simple case: just spam the operations directly
    tester.logger.debug(`No loop needed for ${numOperations} ${opName}s (threshold is ${LOOP_OPS_PER_ITERATION})`);
    for (let i = 0; i < numOperations; i++) {
      instructions.push(createOperation());
    }
  }
}

/**
 * Makes a "contract" given some instructions, then executes it
 * in the public tx simulator. No calldata.
 */
async function executeInstructionsAsContract(
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

  const contract = await tester.registerAndDeployContract(
    /*constructorArgs=*/ [],
    deployer,
    /*contractArtifact=*/ contractArtifact,
  );

  return await tester.executeTxWithLabel(
    /*txLabel=*/ name,
    /*sender=*/ deployer,
    /*setupCalls=*/ [],
    /*appCalls=*/ [
      {
        address: contract.address,
        fnName: 'public_dispatch',
        args: [],
      },
    ],
  );
}

/**
 * Creates a return instruction with the given size and offset.
 * Does a SET to set copySize.
 */
function createReturnInstructions(returnSize: number, returnOffset: number): Instruction[] {
  const copySizeOffset = 10000; // just make sure copySize lives in a free memory slot
  return [
    new Set(/*indirect=*/ 0, /*dstOffset=*/ copySizeOffset, TypeTag.UINT32, /*value=*/ BigInt(returnSize)).as(
      Opcode.SET_128,
      Set.wireFormat128,
    ),
    new Return(/*indirect=*/ 0, copySizeOffset, /*returnOffset=*/ returnOffset).as(Opcode.RETURN, Return.wireFormat),
  ];
}

export async function executeKeccakSpamPublicTx(
  tester: PublicTxSimulationTester,
  numKeccakf1600s?: number,
): Promise<PublicTxResult> {
  const instructions: Instruction[] = [];

  const sizeInput = 25;
  // Initialize 25 uint64 values for Keccak state
  for (let i = 0; i < sizeInput; i++) {
    instructions.push(
      new Set(/*indirect=*/ 0, /*dstOffset=*/ i, TypeTag.UINT64, /*value=*/ i).as(Opcode.SET_8, Set.wireFormat8),
    );
  }

  // Calculate maximum number of operations based on gas (accounting for loop overhead)
  const initGas = instructions.length * AVM_SET_BASE_L2_GAS;
  const availableGas = AVM_MAX_PROCESSABLE_L2_GAS - initGas - SET_AND_RETURN_GAS - GAS_SAFETY_MARGIN;
  tester.logger.debug(`[Keccak] Init gas: ${initGas} (${instructions.length} × ${AVM_SET_BASE_L2_GAS})`);
  tester.logger.debug(`[Keccak] Return gas: ${SET_AND_RETURN_GAS}`);
  tester.logger.debug(`[Keccak] Safety margin: ${GAS_SAFETY_MARGIN}`);
  const maxKeccaks = calculateMaxOperationsWithLoopOverhead(
    availableGas,
    AVM_KECCAKF1600_BASE_L2_GAS,
    tester,
    'Keccak',
  );

  // Use provided number or maximum
  const actualNumKeccaks = numKeccakf1600s ?? maxKeccaks;
  if (actualNumKeccaks > maxKeccaks) {
    throw new Error(
      `Requested ${actualNumKeccaks} Keccakf1600 operations, but max is ${maxKeccaks} based on gas limit`,
    );
  }
  tester.logger.verbose(`Spamming ${actualNumKeccaks} Keccakf1600 operations (max allowed: ${maxKeccaks})`);

  // Use helper to add spam operations with loop if needed
  addSpamOperationsWithLoop(
    instructions,
    actualNumKeccaks,
    () =>
      new KeccakF1600(/*indirect=*/ 0, /*dstOffset=*/ 0, /*inputOffset=*/ 0).as(
        Opcode.KECCAKF1600,
        KeccakF1600.wireFormat,
      ),
    tester,
    'Keccakf1600',
  );

  // Add return instructions (covered by SET_AND_RETURN_GAS in gas math above)
  instructions.push(...createReturnInstructions(sizeInput, 0));

  const loopOverheadKeccak =
    actualNumKeccaks > LOOP_OPS_PER_ITERATION
      ? LOOP_SETUP_GAS + Math.ceil(actualNumKeccaks / LOOP_OPS_PER_ITERATION) * LOOP_ITERATION_OVERHEAD_GAS
      : 0;
  tester.logger.debug(`[Keccak] Final instruction count: ${instructions.length}`);
  tester.logger.debug(
    `[Keccak] Estimated total gas: ${initGas + SET_AND_RETURN_GAS + actualNumKeccaks * AVM_KECCAKF1600_BASE_L2_GAS + loopOverheadKeccak}`,
  );

  return await executeInstructionsAsContract(tester, 'KeccakSpamContract', instructions);
}

export async function executeDivSpamPublicTx(
  tester: PublicTxSimulationTester,
  numDivs?: number,
): Promise<PublicTxResult> {
  const instructions: Instruction[] = [];

  // Initialize divisor and dividend
  instructions.push(
    new Set(/*indirect=*/ 0, /*dstOffset=*/ 0, TypeTag.UINT64, /*value=*/ 10).as(Opcode.SET_8, Set.wireFormat8),
    new Set(/*indirect=*/ 0, /*dstOffset=*/ 1, TypeTag.UINT64, /*value=*/ 3).as(Opcode.SET_8, Set.wireFormat8),
  );

  // Calculate maximum number of DIV operations based on gas (accounting for loop overhead)
  const initGas = instructions.length * AVM_SET_BASE_L2_GAS;
  const availableGas = AVM_MAX_PROCESSABLE_L2_GAS - initGas - SET_AND_RETURN_GAS - GAS_SAFETY_MARGIN;
  tester.logger.debug(`[DIV] Init gas: ${initGas} (${instructions.length} × ${AVM_SET_BASE_L2_GAS})`);
  tester.logger.debug(`[DIV] Return gas: ${SET_AND_RETURN_GAS}`);
  tester.logger.debug(`[DIV] Safety margin: ${GAS_SAFETY_MARGIN}`);
  const maxDivs = calculateMaxOperationsWithLoopOverhead(availableGas, AVM_DIV_BASE_L2_GAS, tester, 'DIV');

  // Use provided number or maximum
  const actualNumDivs = numDivs ?? maxDivs;
  if (actualNumDivs > maxDivs) {
    throw new Error(`Requested ${actualNumDivs} DIV operations, but max is ${maxDivs} based on gas limit`);
  }
  tester.logger.verbose(`Spamming ${actualNumDivs} DIV operations (max allowed: ${maxDivs})`);

  // Use helper to add spam operations with loop if needed
  addSpamOperationsWithLoop(
    instructions,
    actualNumDivs,
    () => new Div(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 1).as(Opcode.DIV_8, Div.wireFormat8),
    tester,
    'DIV',
  );

  // Add return instructions
  instructions.push(...createReturnInstructions(/*returnSize=*/ 1, /*returnOffset=*/ 1));

  const loopOverhead =
    actualNumDivs > LOOP_OPS_PER_ITERATION
      ? LOOP_SETUP_GAS + Math.ceil(actualNumDivs / LOOP_OPS_PER_ITERATION) * LOOP_ITERATION_OVERHEAD_GAS
      : 0;
  tester.logger.debug(`[DIV] Final instruction count: ${instructions.length}`);
  tester.logger.debug(
    `[DIV] Estimated total gas: ${initGas + SET_AND_RETURN_GAS + actualNumDivs * AVM_DIV_BASE_L2_GAS + loopOverhead}`,
  );

  return await executeInstructionsAsContract(tester, 'DivSpamContract', instructions);
}

export async function executeXorSpamPublicTx(
  tester: PublicTxSimulationTester,
  numXors?: number,
): Promise<PublicTxResult> {
  const instructions: Instruction[] = [];

  // Initialize two values to XOR
  instructions.push(
    new Set(/*indirect=*/ 0, /*dstOffset=*/ 0, TypeTag.UINT64, /*value=*/ 0xdeadbeefn).as(
      Opcode.SET_128,
      Set.wireFormat128,
    ),
    new Set(/*indirect=*/ 0, /*dstOffset=*/ 1, TypeTag.UINT64, /*value=*/ 0xfeedfacen).as(
      Opcode.SET_128,
      Set.wireFormat128,
    ),
  );

  // Calculate maximum number of XOR operations based on gas (accounting for loop overhead)
  const initGas = instructions.length * AVM_SET_BASE_L2_GAS;
  const availableGas = AVM_MAX_PROCESSABLE_L2_GAS - initGas - SET_AND_RETURN_GAS - GAS_SAFETY_MARGIN;
  // XOR has both base cost and dynamic cost for bitwise operations
  // Dynamic cost is per byte of the operands (UINT64 = 8 bytes)
  const xorGasPerOp = AVM_XOR_BASE_L2_GAS + AVM_BITWISE_DYN_L2_GAS * 8; // 12 + (3 * 8) = 36
  tester.logger.debug(`[XOR] Init gas: ${initGas} (${instructions.length} × ${AVM_SET_BASE_L2_GAS})`);
  tester.logger.debug(`[XOR] Return gas: ${SET_AND_RETURN_GAS}`);
  tester.logger.debug(`[XOR] Safety margin: ${GAS_SAFETY_MARGIN}`);
  tester.logger.debug(
    `[XOR] Gas per XOR: ${xorGasPerOp} (base: ${AVM_XOR_BASE_L2_GAS}, dynamic: ${AVM_BITWISE_DYN_L2_GAS * 8})`,
  );
  const maxXors = calculateMaxOperationsWithLoopOverhead(availableGas, xorGasPerOp, tester, 'XOR');

  // Use provided number or maximum
  const actualNumXors = numXors ?? maxXors;
  if (actualNumXors > maxXors) {
    throw new Error(`Requested ${actualNumXors} XOR operations, but max is ${maxXors} based on gas limit`);
  }
  tester.logger.verbose(`Spamming ${actualNumXors} XOR operations (max allowed: ${maxXors})`);

  // Use helper to add spam operations with loop if needed
  addSpamOperationsWithLoop(
    instructions,
    actualNumXors,
    () => new Xor(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 1).as(Opcode.XOR_8, Xor.wireFormat8),
    tester,
    'XOR',
  );

  // Add return instructions
  instructions.push(...createReturnInstructions(/*returnSize=*/ 1, /*returnOffset=*/ 1));

  const loopOverheadXor =
    actualNumXors > LOOP_OPS_PER_ITERATION
      ? LOOP_SETUP_GAS + Math.ceil(actualNumXors / LOOP_OPS_PER_ITERATION) * LOOP_ITERATION_OVERHEAD_GAS
      : 0;
  tester.logger.debug(`[XOR] Final instruction count: ${instructions.length}`);
  tester.logger.debug(
    `[XOR] Estimated total gas: ${initGas + SET_AND_RETURN_GAS + actualNumXors * xorGasPerOp + loopOverheadXor}`,
  );

  return await executeInstructionsAsContract(tester, 'XorSpamContract', instructions);
}

export async function executePoseidonSpamPublicTx(
  tester: PublicTxSimulationTester,
  numPoseidons?: number,
): Promise<PublicTxResult> {
  const instructions: Instruction[] = [];

  // Initialize 4 field elements for Poseidon2 state
  for (let i = 0; i < 4; i++) {
    instructions.push(
      new Set(/*indirect=*/ 0, /*dstOffset=*/ i, TypeTag.FIELD, /*value=*/ i + 1).as(Opcode.SET_8, Set.wireFormat8),
    );
  }
  // Calculate maximum number of operations based on gas (accounting for loop overhead)
  const initGas = instructions.length * AVM_SET_BASE_L2_GAS;
  const availableGas = AVM_MAX_PROCESSABLE_L2_GAS - initGas - SET_AND_RETURN_GAS - GAS_SAFETY_MARGIN;
  tester.logger.debug(`[Poseidon2] Init gas: ${initGas} (${instructions.length} × ${AVM_SET_BASE_L2_GAS})`);
  tester.logger.debug(`[Poseidon2] Return gas: ${SET_AND_RETURN_GAS}`);
  tester.logger.debug(`[Poseidon2] Safety margin: ${GAS_SAFETY_MARGIN}`);
  const maxPoseidons = calculateMaxOperationsWithLoopOverhead(
    availableGas,
    AVM_POSEIDON2_BASE_L2_GAS + 2, // FIXME: adding a buffer here because we overflowed the memory trace!
    tester,
    'Poseidon2',
  );

  // Use provided number or maximum
  const actualNumPoseidons = numPoseidons ?? maxPoseidons;
  if (actualNumPoseidons > maxPoseidons) {
    throw new Error(
      `Requested ${actualNumPoseidons} Poseidon2 operations, but max is ${maxPoseidons} based on gas limit`,
    );
  }
  tester.logger.verbose(`Spamming ${actualNumPoseidons} Poseidon2 operations (max allowed: ${maxPoseidons})`);

  // Use helper to add spam operations with loop if needed
  addSpamOperationsWithLoop(
    instructions,
    actualNumPoseidons,
    () =>
      new Poseidon2(/*indirect=*/ 0, /*inputStateOffset=*/ 0, /*outputStateOffset=*/ 0).as(
        Opcode.POSEIDON2,
        Poseidon2.wireFormat,
      ),
    tester,
    'Poseidon2',
  );

  // Add return instructions (covered by SET_AND_RETURN_GAS in gas math above)
  instructions.push(...createReturnInstructions(/*returnSize=*/ 4, /*returnOffset=*/ 0));

  const loopOverheadPoseidon =
    actualNumPoseidons > LOOP_OPS_PER_ITERATION
      ? LOOP_SETUP_GAS + Math.ceil(actualNumPoseidons / LOOP_OPS_PER_ITERATION) * LOOP_ITERATION_OVERHEAD_GAS
      : 0;
  tester.logger.debug(`[Poseidon2] Final instruction count: ${instructions.length}`);
  tester.logger.debug(
    `[Poseidon2] Estimated total gas: ${initGas + SET_AND_RETURN_GAS + actualNumPoseidons * AVM_POSEIDON2_BASE_L2_GAS + loopOverheadPoseidon}`,
  );

  const timer = new Timer();
  const result = await executeInstructionsAsContract(tester, 'PoseidonSpamContract', instructions);
  tester.logger.debug(`[Poseidon2] Execution time: ${timer.ms()}ms`);
  tester.logger.debug(`[Poseidon2] Execution time: ${timer.ms()}ms`);
  tester.logger.debug(`[Poseidon2] Execution time: ${timer.ms()}ms`);
  tester.logger.debug(`[Poseidon2] Execution time: ${timer.ms()}ms`);
  return result;
}

export async function executeSha256SpamPublicTx(
  tester: PublicTxSimulationTester,
  numSha256s?: number,
): Promise<PublicTxResult> {
  const instructions: Instruction[] = [];

  // Initialize state (8 uint32s) and inputs (16 uint32s) for SHA256 compression
  // State
  for (let i = 0; i < 8; i++) {
    instructions.push(
      new Set(/*indirect=*/ 0, /*dstOffset=*/ i, TypeTag.UINT32, /*value=*/ i).as(Opcode.SET_8, Set.wireFormat8),
    );
  }
  // Inputs
  for (let i = 0; i < 16; i++) {
    instructions.push(
      new Set(/*indirect=*/ 0, /*dstOffset=*/ 8 + i, TypeTag.UINT32, /*value=*/ i).as(Opcode.SET_32, Set.wireFormat32),
    );
  }
  // Calculate maximum number of operations based on gas (accounting for loop overhead)
  const initGas = instructions.length * AVM_SET_BASE_L2_GAS;
  const availableGas = AVM_MAX_PROCESSABLE_L2_GAS - initGas - SET_AND_RETURN_GAS - GAS_SAFETY_MARGIN;
  tester.logger.debug(`[SHA256] Init gas: ${initGas} (${instructions.length} × ${AVM_SET_BASE_L2_GAS})`);
  tester.logger.debug(`[SHA256] Return gas: ${SET_AND_RETURN_GAS}`);
  tester.logger.debug(`[SHA256] Safety margin: ${GAS_SAFETY_MARGIN}`);
  const maxSha256s = calculateMaxOperationsWithLoopOverhead(
    availableGas,
    AVM_SHA256COMPRESSION_BASE_L2_GAS,
    tester,
    'SHA256',
  );

  // Use provided number or maximum
  const actualNumSha256s = numSha256s ?? maxSha256s;
  if (actualNumSha256s > maxSha256s) {
    throw new Error(
      `Requested ${actualNumSha256s} SHA256 compression operations, but max is ${maxSha256s} based on gas limit`,
    );
  }
  tester.logger.verbose(`Spamming ${actualNumSha256s} SHA256 compression operations (max allowed: ${maxSha256s})`);

  // Use helper to add spam operations with loop if needed
  addSpamOperationsWithLoop(
    instructions,
    actualNumSha256s,
    () =>
      new Sha256Compression(/*indirect=*/ 0, /*outputOffset=*/ 0, /*stateOffset=*/ 0, /*inputsOffset=*/ 8).as(
        Opcode.SHA256COMPRESSION,
        Sha256Compression.wireFormat,
      ),
    tester,
    'SHA256',
  );

  // Add return instructions (covered by SET_AND_RETURN_GAS in gas math above)
  instructions.push(...createReturnInstructions(8, 0));

  const loopOverheadSha =
    actualNumSha256s > LOOP_OPS_PER_ITERATION
      ? LOOP_SETUP_GAS + Math.ceil(actualNumSha256s / LOOP_OPS_PER_ITERATION) * LOOP_ITERATION_OVERHEAD_GAS
      : 0;
  tester.logger.debug(`[SHA256] Final instruction count: ${instructions.length}`);
  tester.logger.debug(
    `[SHA256] Estimated total gas: ${initGas + SET_AND_RETURN_GAS + actualNumSha256s * AVM_SHA256COMPRESSION_BASE_L2_GAS + loopOverheadSha}`,
  );

  return await executeInstructionsAsContract(tester, 'Sha256SpamContract', instructions);
}
