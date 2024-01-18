import { Fr } from '@aztec/foundation/fields';

import { MockProxy, mock } from 'jest-mock-extended';

import { AvmMachineState } from '../avm_machine_state.js';
import { AvmStateManager } from '../avm_state_manager.js';
import { initExecutionEnvironmentEmpty } from '../fixtures/index.js';
import { Add } from '../opcodes/arithmetic.js';
import { Jump, Return } from '../opcodes/control_flow.js';
import { Instruction } from '../opcodes/instruction.js';
import { CalldataCopy } from '../opcodes/memory.js';
import { AvmInterpreter } from './interpreter.js';

describe('interpreter', () => {
  let stateManager: MockProxy<AvmStateManager>;

  beforeEach(() => {
    stateManager = mock<AvmStateManager>();
  });

  it('Should execute a series of instructions', () => {
    const calldata: Fr[] = [new Fr(1), new Fr(2)];

    const instructions: Instruction[] = [
      // Copy the first two elements of the calldata to memory regions 0 and 1
      new CalldataCopy(0, 2, 0),
      // Add the two together and store the result in memory region 2
      new Add(0, 1, 2), // 1 + 2
      // Return the result
      new Return(2, 1), // [3]
    ];

    const context = new AvmMachineState(calldata, initExecutionEnvironmentEmpty());
    const interpreter = new AvmInterpreter(context, stateManager, instructions);
    const avmReturnData = interpreter.run();

    expect(avmReturnData.reverted).toBe(false);

    const returnData = avmReturnData.output;
    expect(returnData.length).toBe(1);
    expect(returnData).toEqual([new Fr(3)]);
  });

  it('Should revert with an invalid jump', () => {
    const calldata: Fr[] = [];

    const invalidJumpDestination = 22;

    const instructions: Instruction[] = [new Jump(invalidJumpDestination)];

    const context = new AvmMachineState(calldata, initExecutionEnvironmentEmpty());
    const interpreter = new AvmInterpreter(context, stateManager, instructions);

    const avmReturnData = interpreter.run();

    expect(avmReturnData.reverted).toBe(true);
  });
});
