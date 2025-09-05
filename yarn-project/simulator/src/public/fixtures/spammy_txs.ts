import { FunctionType, emptyContractArtifact, emptyFunctionArtifact } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { TypeTag } from '../avm/avm_memory_types.js';
import { Div, Instruction, KeccakF1600, Poseidon2, Return, Set, Sha256Compression, Xor } from '../avm/opcodes/index.js';
import { encodeToBytecode } from '../avm/serialization/bytecode_serialization.js';
import { Opcode } from '../avm/serialization/instruction_serialization.js';
import type { PublicTxResult } from '../public_tx_simulator/public_tx_simulator.js';
import { PublicTxSimulationTester } from './public_tx_simulation_tester.js';

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
  numKeccakf1600s: number = 100,
): Promise<PublicTxResult> {
  const instructions: Instruction[] = [];

  // Initialize 25 uint64 values for Keccak state
  for (let i = 0; i < 25; i++) {
    instructions.push(
      new Set(/*indirect=*/ 0, /*dstOffset=*/ i, TypeTag.UINT64, /*value=*/ i).as(Opcode.SET_8, Set.wireFormat8),
    );
  }

  // Spam keccakf1600s
  for (let i = 0; i < numKeccakf1600s; i++) {
    instructions.push(
      new KeccakF1600(/*indirect=*/ 0, /*dstOffset=*/ 0, /*inputOffset=*/ 0).as(
        Opcode.KECCAKF1600,
        KeccakF1600.wireFormat,
      ),
    );
  }

  // Add return instructions
  instructions.push(...createReturnInstructions(25, 0));

  return await executeInstructionsAsContract(tester, 'KeccakSpamContract', instructions);
}

export async function executeDivSpamPublicTx(
  tester: PublicTxSimulationTester,
  numDivs: number = 200,
): Promise<PublicTxResult> {
  const instructions: Instruction[] = [];

  // Initialize divisor and dividend
  instructions.push(
    new Set(/*indirect=*/ 0, /*dstOffset=*/ 0, TypeTag.UINT64, /*value=*/ 10).as(Opcode.SET_8, Set.wireFormat8),
    new Set(/*indirect=*/ 0, /*dstOffset=*/ 1, TypeTag.UINT64, /*value=*/ 3).as(Opcode.SET_8, Set.wireFormat8),
  );

  // Spam DIV operations
  for (let i = 0; i < numDivs; i++) {
    // write the result to the same offset as an operand so that every DIV is different
    instructions.push(
      new Div(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 1).as(Opcode.DIV_8, Div.wireFormat8),
    );
  }

  // Add return instructions
  instructions.push(...createReturnInstructions(/*returnSize=*/ 1, /*returnOffset=*/ 1));

  return await executeInstructionsAsContract(tester, 'DivSpamContract', instructions);
}

export async function executeXorSpamPublicTx(
  tester: PublicTxSimulationTester,
  numXors: number = 200,
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

  // Spam XOR operations
  for (let i = 0; i < numXors; i++) {
    // write the result to the same offset as an operand so that every XOR is different
    instructions.push(
      new Xor(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 1).as(Opcode.XOR_8, Xor.wireFormat8),
    );
  }

  // Add return instructions
  instructions.push(...createReturnInstructions(/*returnSize=*/ 1, /*returnOffset=*/ 1));

  return await executeInstructionsAsContract(tester, 'XorSpamContract', instructions);
}

export async function executePoseidonSpamPublicTx(
  tester: PublicTxSimulationTester,
  numPoseidons: number = 200,
): Promise<PublicTxResult> {
  const instructions: Instruction[] = [];

  // Initialize 4 field elements for Poseidon2 state
  for (let i = 0; i < 4; i++) {
    instructions.push(
      new Set(/*indirect=*/ 0, /*dstOffset=*/ i, TypeTag.FIELD, /*value=*/ i + 1).as(Opcode.SET_8, Set.wireFormat8),
    );
  }

  // Spam Poseidon2 operations
  for (let i = 0; i < numPoseidons; i++) {
    instructions.push(
      new Poseidon2(/*indirect=*/ 0, /*inputStateOffset=*/ 0, /*outputStateOffset=*/ 0).as(
        Opcode.POSEIDON2,
        Poseidon2.wireFormat,
      ),
    );
  }

  // Add return instructions
  instructions.push(...createReturnInstructions(/*returnSize=*/ 4, /*returnOffset=*/ 0));

  return await executeInstructionsAsContract(tester, 'PoseidonSpamContract', instructions);
}

export async function executeSha256SpamPublicTx(
  tester: PublicTxSimulationTester,
  numSha256s: number = 200,
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

  // Spam SHA256 compression operations
  for (let i = 0; i < numSha256s; i++) {
    instructions.push(
      new Sha256Compression(/*indirect=*/ 0, /*outputOffset=*/ 0, /*stateOffset=*/ 0, /*inputsOffset=*/ 8).as(
        Opcode.SHA256COMPRESSION,
        Sha256Compression.wireFormat,
      ),
    );
  }

  // Add return instructions
  instructions.push(...createReturnInstructions(8, 0));

  return await executeInstructionsAsContract(tester, 'Sha256SpamContract', instructions);
}
