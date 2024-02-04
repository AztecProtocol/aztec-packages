import { Fr } from '@aztec/foundation/fields';

import { MockProxy, mock } from 'jest-mock-extended';

import { AvmContext, InvalidProgramCounterError } from '../avm_context.js';
import { TypeTag } from '../avm_memory_types.js';
import { initExecutionEnvironment, initMachineState } from '../fixtures/index.js';
import { AvmJournal } from '../journal/journal.js';
import { Add } from '../opcodes/arithmetic.js';
import { Jump, Return } from '../opcodes/control_flow.js';
import { Instruction } from '../opcodes/instruction.js';
import { CalldataCopy } from '../opcodes/memory.js';

describe('interpreter', () => {
  let context: AvmContext;
  let journal: MockProxy<AvmJournal>;

  beforeEach(() => {
    journal = mock<AvmJournal>();
    context = new AvmContext(journal)
  });

  it('Should execute a series of instructions', async () => {
    const calldata: Fr[] = [new Fr(1), new Fr(2)];

    const instructions: Instruction[] = [
      new CalldataCopy(/*indirect=*/ 0, /*cdOffset=*/ 0, /*copySize=*/ 2, /*dstOffset=*/ 0),
      new Add(/*indirect=*/ 0, TypeTag.FIELD, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2),
      new Return(/*indirect=*/ 0, /*returnOffset=*/ 2, /*copySize=*/ 1),
    ];

    const contextInputs = {
      environment: initExecutionEnvironment({ calldata }),
      initialMachineState: initMachineState(),
    };
    context = new AvmContext(journal, initExecutionEnvironment({ calldata }));
    // Set instructions (skip bytecode decoding)
    context.setInstructions(instructions);
    const results = await context.execute()

    expect(results.reverted).toBe(false);
    expect(results.revertReason).toBeUndefined();
    expect(results.output).toEqual([new Fr(3)]);
  });

  it('Should revert with an invalid jump', async () => {
    const calldata: Fr[] = [];

    const invalidJumpDestination = 22;

    const instructions: Instruction[] = [new Jump(invalidJumpDestination)];

    context = new AvmContext(journal, initExecutionEnvironment({ calldata }));
    // Set instructions (skip bytecode decoding)
    context.setInstructions(instructions);
    const results = await context.execute()

    expect(results.reverted).toBe(true);
    expect(results.revertReason).toBeInstanceOf(InvalidProgramCounterError);
    expect(results.output).toHaveLength(0);
  });
});
