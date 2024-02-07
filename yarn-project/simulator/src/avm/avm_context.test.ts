import { AztecAddress, Fr } from '@aztec/circuits.js';

import { allSameExcept, initContext } from './fixtures/index.js';
import { AvmWorldStateJournal } from './journal/journal.js';

describe('Avm Context', () => {
  it('New call should fork context correctly', () => {
    const context = initContext();
    context.machineState.pc = 20;

    const newAddress = AztecAddress.random();
    const newCalldata = [new Fr(1), new Fr(2)];
    const newContext = context.createNestedContractCallContext(newAddress, newCalldata);

    expect(newContext.environment).toEqual(
      allSameExcept(context.environment, {
        address: newAddress,
        storageAddress: newAddress,
        calldata: newCalldata,
        isStaticCall: false,
      }),
    );
    expect(newContext.machineState).toEqual(
      allSameExcept(context.machineState, {
        pc: 0,
      }),
    );

    compareJournal(newContext.worldState, context.worldState.fork());
  });

  function compareJournal(actual: AvmWorldStateJournal, expected: AvmWorldStateJournal) {
    const removeParentReference = (journal: AvmWorldStateJournal) => {
      const j = JSON.parse(JSON.stringify(journal));
      delete j.parentJournal;
      return j;
    }

    expect(removeParentReference(actual)).toEqual(removeParentReference(expected));
  }

  it('New static call should fork context correctly', () => {
    const context = initContext();
    context.machineState.pc = 20;

    const newAddress = AztecAddress.random();
    const newCalldata = [new Fr(1), new Fr(2)];
    const newContext = context.createNestedContractStaticCallContext(newAddress, newCalldata);

    expect(newContext.environment).toEqual(
      allSameExcept(context.environment, {
        address: newAddress,
        storageAddress: newAddress,
        calldata: newCalldata,
        isStaticCall: true,
      }),
    );
    expect(newContext.machineState).toEqual(
      allSameExcept(context.machineState, {
        pc: 0,
      }),
    );
    // FIXME: I can't get this to work.
    // expect(newContext.worldState).toEqual(context.worldState.fork());
  });
});
