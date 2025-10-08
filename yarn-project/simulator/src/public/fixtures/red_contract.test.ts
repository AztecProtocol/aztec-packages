import { Fr } from '@aztec/foundation/fields';
import { FunctionType, emptyContractArtifact, emptyFunctionArtifact } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { writeFile } from 'fs/promises';

import { TypeTag } from '../avm/avm_memory_types.js';
import { Add, CalldataCopy, Cast, Instruction, JumpI, Lt, Poseidon2, Return, Set } from '../avm/opcodes/index.js';
import { encodeToBytecode } from '../avm/serialization/bytecode_serialization.js';
import { Opcode } from '../avm/serialization/instruction_serialization.js';
import { PublicTxSimulationTester } from './public_tx_simulation_tester.js';

function createPoseidonSpamContract() {
  const preambleInstructions = [
    // SET at address 1 an 1_u32 constant.
    new Set(/*indirect*/ 0, /*dstOffset*/ 1, TypeTag.UINT32, /* value */ 1).as(Opcode.SET_8, Set.wireFormat8),
    // COPY from calldata starting at offset 1, size 1, to address 2.
    new CalldataCopy(/*indirect*/ 0, /*copySize*/ 1, /* cdStartOffset */ 1, /*dstOffset*/ 2).as(
      Opcode.CALLDATACOPY,
      CalldataCopy.wireFormat,
    ),
    // CAST address 2 to a u32.
    new Cast(/*indirect*/ 0, /*srcOffset*/ 2, /*dstOffset*/ 2, /*dstTag*/ TypeTag.UINT32).as(
      Opcode.CAST_8,
      Cast.wireFormat8,
    ),
    // SET the starting value of the iterator at address 3
    new Set(/*indirect*/ 0, /*dstOffset*/ 3, TypeTag.UINT32, /*value*/ 0).as(Opcode.SET_8, Set.wireFormat8),
  ];

  const preambleSize = encodeToBytecode(preambleInstructions).length;

  const loopBodyInstructions = new Array(1000).fill(
    new Poseidon2(/*indirect*/ 0, /*inputStateOffset*/ 100, /*outputStateOffset*/ 100).as(
      Opcode.POSEIDON2,
      Poseidon2.wireFormat,
    ),
  );

  const buffer = encodeToBytecode([
    ...preambleInstructions,
    ...loopBodyInstructions,
    new Add(/*indirect*/ 0, /*aOffset*/ 3, /*bOffset*/ 1, /*dstOffset*/ 3).as(Opcode.ADD_8, Add.wireFormat8),
    new Lt(/*indirect*/ 0, /*aOffset*/ 3, /*bOffset*/ 2, /*dstOffset*/ 4).as(Opcode.LT_8, Lt.wireFormat8),
    new JumpI(/*indirect*/ 0, /*condOffset*/ 4, /*loc*/ preambleSize).as(Opcode.JUMPI_32, JumpI.wireFormat),
    new Set(/*indirect*/ 0, /*dstOffset*/ 42, TypeTag.UINT32, /* value */ 0).as(Opcode.SET_8, Set.wireFormat8),
    new Return(/*indirect*/ 0, /*returnSizeAddress*/ 42, /*returnOffset*/ 42).as(Opcode.RETURN, Return.wireFormat),
  ]);

  return buffer;
}

function createPoseidonSpamContractNoLoop() {
  const instructions: Instruction[] = [];
  for (let i = 0; i < 100000; i++) {
    instructions.push(
      new Poseidon2(/*indirect*/ 0, /*inputStateOffset*/ 0, /*outputStateOffset*/ 0).as(
        Opcode.POSEIDON2,
        Poseidon2.wireFormat,
      ),
    );
  }
  instructions.push(
    new Set(/*indirect*/ 0, /*dstOffset*/ 42, TypeTag.UINT32, /* value */ 0).as(Opcode.SET_8, Set.wireFormat8),
  );
  instructions.push(
    new Return(/*indirect*/ 0, /*returnSizeAddress*/ 42, /*returnOffset*/ 42).as(Opcode.RETURN, Return.wireFormat),
  );

  const buffer = encodeToBytecode(instructions);
  return buffer;
}

it('generates poseidon spam no loop', async () => {
  const base64 = createPoseidonSpamContractNoLoop().toString('base64');
  await writeFile('poseidon_spam_no_loop.bytecode', base64);
});

it('generates poseidon spam with loop', async () => {
  const base64 = createPoseidonSpamContract().toString('base64');
  await writeFile('poseidon_spam.bytecode', base64);
});

it('executes poseidon spam with loop', async () => {
  const deployer = AztecAddress.fromNumber(42);

  const simTester = await PublicTxSimulationTester.create();
  const spamBytecode = createPoseidonSpamContract();

  const minimalContractArtifact = emptyContractArtifact();
  minimalContractArtifact.name = 'MinimalContract';
  minimalContractArtifact.functions = [emptyFunctionArtifact()];
  minimalContractArtifact.functions[0].name = 'public_dispatch';
  minimalContractArtifact.functions[0].functionType = FunctionType.PUBLIC;
  minimalContractArtifact.functions[0].bytecode = spamBytecode;
  minimalContractArtifact.functions[0].parameters = [
    {
      name: 'n',
      type: {
        kind: 'integer',
        sign: 'unsigned',
        width: 32,
      },
      visibility: 'public',
    },
  ];

  const minimalTestContract = await simTester.registerAndDeployContract(
    /*constructorArgs=*/ [],
    deployer,
    /*contractArtifact=*/ minimalContractArtifact,
  );

  const result = await simTester.simulateTx(
    /*sender=*/ deployer,
    /*setupCalls=*/ [],
    /*appCalls=*/ [
      {
        address: minimalTestContract.address,
        fnName: 'public_dispatch',
        args: [new Fr(249)],
      },
    ],
    /*teardownCall=*/ undefined,
    /*feePayer=*/ deployer,
  );
  if (!result.revertCode.isOK()) {
    throw new Error(`Contract execution has reverted: ${result.revertReason?.getMessage()}`);
  }
});
