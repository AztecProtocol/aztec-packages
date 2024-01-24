import { Fr } from '@aztec/foundation/fields';

import { mock } from 'jest-mock-extended';

import { AvmMachineState } from '../avm_machine_state.js';
import { AvmStateManager } from '../avm_state_manager.js';
import { Add } from '../opcodes/arithmetic.js';
import { Jump, Return } from '../opcodes/control_flow.js';
import { Instruction } from '../opcodes/instruction.js';
import { CalldataCopy } from '../opcodes/memory.js';
import { AvmInterpreter, InvalidProgramCounterError } from './interpreter.js';

describe('interpreter', () => {
  it('Should execute a series of instructions', () => {
    const calldata: Fr[] = [new Fr(1), new Fr(2)];
    const stateManager = mock<AvmStateManager>();

    const instructions: Instruction[] = [
      new CalldataCopy(/*cdOffset=*/ 0, /*copySize=*/ 2, /*destOffset=*/ 0),
      new Add(/*aOffset=*/ 0, /*bOffset=*/ 1, /*destOffset=*/ 2),
      new Return(/*returnOffset=*/ 2, /*copySize=*/ 1),
    ];

    const context = new AvmMachineState(calldata);
    const interpreter = new AvmInterpreter(context, stateManager, instructions);
    const avmReturnData = interpreter.run();

    expect(avmReturnData.reverted).toBe(false);
    expect(avmReturnData.revertReason).toBeUndefined();
    expect(avmReturnData.output).toEqual([new Fr(3)]);
  });

  it('Should revert with an invalid jump', () => {
    const calldata: Fr[] = [];
    const stateManager = mock<AvmStateManager>();

    const invalidJumpDestination = 22;

    const instructions: Instruction[] = [new Jump(invalidJumpDestination)];

    const context = new AvmMachineState(calldata);
    const interpreter = new AvmInterpreter(context, stateManager, instructions);

    const avmReturnData = interpreter.run();

    expect(avmReturnData.reverted).toBe(true);
    expect(avmReturnData.revertReason).toBeInstanceOf(InvalidProgramCounterError);
    expect(avmReturnData.output).toHaveLength(0);
  });
});
