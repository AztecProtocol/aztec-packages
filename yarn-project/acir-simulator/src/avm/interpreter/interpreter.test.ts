import { Fr } from '@aztec/foundation/fields';

import { mock } from 'jest-mock-extended';

import { AvmContext } from '../avm_context.js';
import { AvmStateManager } from '../avm_state_manager.js';
import { Add } from '../opcodes/arithmetic.js';
import { Return } from '../opcodes/control_flow.js';
import { CallDataCopy } from '../opcodes/memory.js';
import { Opcode } from '../opcodes/opcode.js';
import { AvmInterpreter } from './interpreter.js';

describe('interpreter', () => {
  it('Should execute a series of opcodes', () => {
    const calldata: Fr[] = [new Fr(1), new Fr(2)];
    const stateManager = mock<AvmStateManager>();

    const opcodes: Opcode[] = [
      // Copy the first two elements of the calldata to memory regions 0 and 1
      new CallDataCopy(0, 2, 0),
      // Add the two together and store the result in memory region 2
      new Add(0, 1, 2), // 1 + 2
      // Return the result
      new Return(2, 1), // [3]
    ];

    const context = new AvmContext(calldata);
    const interpreter = new AvmInterpreter(context, stateManager, opcodes);
    const success = interpreter.run();

    expect(success).toBe(true);

    const returnData = interpreter.returnData();
    expect(returnData.length).toBe(1);
    expect(returnData).toEqual([new Fr(3)]);
  });
});
