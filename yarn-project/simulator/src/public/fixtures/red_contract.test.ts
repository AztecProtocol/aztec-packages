import { writeFile } from 'fs/promises';

import { TypeTag } from '../avm/avm_memory_types.js';
import { Add, CalldataCopy, Cast, Instruction, JumpI, Lt, Poseidon2, Return, Set } from '../avm/opcodes/index.js';
import { encodeToBytecode } from '../avm/serialization/bytecode_serialization.js';
import { Opcode } from '../avm/serialization/instruction_serialization.js';

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

  const buffer = encodeToBytecode([
    ...preambleInstructions,
    new Poseidon2(/*indirect*/ 0, /*inputStateOffset*/ 100, /*outputStateOffset*/ 100).as(
      Opcode.POSEIDON2,
      Poseidon2.wireFormat,
    ),
    new Add(/*indirect*/ 0, /*aOffset*/ 3, /*bOffset*/ 1, /*dstOffset*/ 3).as(Opcode.ADD_8, Add.wireFormat8),
    new Lt(/*indirect*/ 0, /*aOffset*/ 3, /*bOffset*/ 2, /*dstOffset*/ 4).as(Opcode.LT_8, Lt.wireFormat8),
    new JumpI(/*indirect*/ 0, /*condOffset*/ 4, /*loc*/ preambleSize).as(Opcode.JUMPI_32, JumpI.wireFormat),
    new Set(/*indirect*/ 0, /*dstOffset*/ 42, TypeTag.UINT32, /* value */ 0).as(Opcode.SET_8, Set.wireFormat8),
    new Return(/*indirect*/ 0, /*returnSizeAddress*/ 42, /*returnOffset*/ 42).as(Opcode.RETURN, Return.wireFormat),
  ]);

  const base64 = buffer.toString('base64');
  return base64;
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
  // Convert buffer to base64
  const base64 = buffer.toString('base64');
  return base64;
}

it('generates poseidon spam no loop', async () => {
  const base64 = createPoseidonSpamContractNoLoop();
  await writeFile('poseidon_spam_no_loop.bytecode', base64);
});

it('generates poseidon spam with loop', async () => {
  const base64 = createPoseidonSpamContract();
  await writeFile('poseidon_spam.bytecode', base64);
});
