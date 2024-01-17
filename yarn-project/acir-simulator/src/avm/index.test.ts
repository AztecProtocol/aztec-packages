import { Fr } from '@aztec/foundation/fields';

import { mock } from 'jest-mock-extended';

import { AvmMachineState } from './avm_machine_state.js';
import { AvmStateManager } from './avm_state_manager.js';
import { AvmInterpreter } from './interpreter/interpreter.js';
import { Add } from './opcodes/arithmetic.js';
import { Return } from './opcodes/control_flow.js';
import { interpretBytecode } from './opcodes/from_bytecode.js';
import { CalldataCopy } from './opcodes/memory.js';
import { Opcode } from './opcodes/opcodes.js';

function genInstructionBytecode(opcode: Opcode, args: number[], assertArgsLength: number): Buffer {
  expect(args.length).toBe(assertArgsLength);
  // 1 byte for opcode, 4 bytes for each argument
  const bytecode = Buffer.alloc(1 + args.length * 4);

  let byteOffset = 0;
  bytecode.writeUInt8(opcode as number, byteOffset);
  byteOffset++;
  for (let i = 0; i < args.length; i++) {
    bytecode.writeUInt32BE(args[i], byteOffset);
    byteOffset += 4;
  }
  return bytecode;
}

describe('avm', () => {
  it('Should execute bytecode', () => {
    const calldata: Fr[] = [new Fr(1), new Fr(2)];
    const stateManager = mock<AvmStateManager>();

    // Construct bytecode
    const calldataCopyArgs = [0, 2, 0];
    const addArgs = [0, 1, 2];
    const returnArgs = [2, 1];

    const calldataCopyBytecode = genInstructionBytecode(
      Opcode.CALLDATACOPY,
      calldataCopyArgs,
      CalldataCopy.numberOfOperands,
    );
    const addBytecode = genInstructionBytecode(Opcode.ADD, addArgs, Add.numberOfOperands);
    const returnBytecode = genInstructionBytecode(Opcode.RETURN, returnArgs, Return.numberOfOperands);
    const fullBytecode = Buffer.concat([calldataCopyBytecode, addBytecode, returnBytecode]);

    // Decode bytecode into instructions
    const instructions = interpretBytecode(fullBytecode);

    // Execute instructions
    const context = new AvmMachineState(calldata);
    const interpreter = new AvmInterpreter(context, stateManager, instructions);
    const avmReturnData = interpreter.run();

    expect(avmReturnData.reverted).toBe(false);

    const returnData = avmReturnData.output;
    expect(returnData.length).toBe(1);
    expect(returnData).toEqual([new Fr(3)]);
  });
});
