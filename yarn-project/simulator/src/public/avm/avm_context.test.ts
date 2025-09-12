import { Fr } from '@aztec/foundation/fields';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { initContext } from './fixtures/initializers.js';
import { allSameExcept } from './fixtures/utils.js';

describe('Avm Context', () => {
  // A helper function to stringify a value that includes bigints.
  const stringify = (value: any) => {
    const replacer = (_key: string, value: any) => {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    };
    return JSON.stringify(value, replacer);
  };

  it('New call should fork context correctly', async () => {
    const context = initContext();
    context.machineState.pc = 20;

    const newAddress = await AztecAddress.random();
    const newCalldata = [new Fr(1), new Fr(2)];
    const allocatedGas = { l2Gas: 2, daGas: 3 }; // How much of the current call gas we pass to the nested call
    const newContext = await context.createNestedContractCallContext(newAddress, newCalldata, allocatedGas, 'CALL');

    expect(newContext.environment).toEqual(
      allSameExcept(context.environment, {
        address: newAddress,
        contractCallDepth: Fr.ONE,
        calldata: newCalldata,
        isStaticCall: false,
      }),
    );
    expect(newContext.machineState).toEqual(
      allSameExcept(context.machineState, {
        pc: 0,
        l2GasLeft: 2,
        daGasLeft: 3,
      }),
    );

    expect(stringify(newContext.persistableState)).toEqual(stringify(await context.persistableState.fork()));
  });

  it('New static call should fork context correctly', async () => {
    const context = initContext();
    context.machineState.pc = 20;

    const newAddress = await AztecAddress.random();
    const newCalldata = [new Fr(1), new Fr(2)];
    const allocatedGas = { l2Gas: 2, daGas: 3 };
    const newContext = await context.createNestedContractCallContext(
      newAddress,
      newCalldata,
      allocatedGas,
      'STATICCALL',
    );

    expect(newContext.environment).toEqual(
      allSameExcept(context.environment, {
        address: newAddress,
        contractCallDepth: Fr.ONE,
        calldata: newCalldata,
        isStaticCall: true,
      }),
    );
    expect(newContext.machineState).toEqual(
      allSameExcept(context.machineState, {
        pc: 0,
        l2GasLeft: 2,
        daGasLeft: 3,
      }),
    );

    expect(stringify(newContext.persistableState)).toEqual(stringify(await context.persistableState.fork()));
  });
});
