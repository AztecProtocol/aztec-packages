import { AztecAddress, Fr } from '@aztec/circuits.js';

import { allSameExcept, initContext } from './fixtures/index.js';

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

    expect(newContext.worldState).toEqual(context.worldState.forkForNestedCall(/*callPointer=*/Fr.ZERO, newAddress, newAddress));
  });

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

    expect(newContext.worldState).toEqual(context.worldState.forkForNestedCall(/*callPointer=*/Fr.ZERO, newAddress, newAddress));
  });
});
