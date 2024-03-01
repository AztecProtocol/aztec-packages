import { Fr } from '@aztec/foundation/fields';

import { allSameExcept, initExecutionEnvironment } from './fixtures/index.js';
import { FunctionSelector } from '@aztec/circuits.js';

describe('Execution Environment', () => {
  const newAddress = new Fr(123456n);
  const calldata = [new Fr(1n), new Fr(2n), new Fr(3n)];

  it('New call should fork execution environment correctly', () => {
    const executionEnvironment = initExecutionEnvironment();
    const newExecutionEnvironment = executionEnvironment.deriveEnvironmentForNestedCall(newAddress, calldata, FunctionSelector.empty());

    expect(newExecutionEnvironment).toEqual(
      allSameExcept(executionEnvironment, {
        address: newAddress,
        storageAddress: newAddress,
        calldata,
      }),
    );
  });

  it('New delegate call should fork execution environment correctly', () => {
    const executionEnvironment = initExecutionEnvironment();
    const newExecutionEnvironment = executionEnvironment.newDelegateCall(newAddress, calldata, FunctionSelector.empty());

    expect(newExecutionEnvironment).toEqual(
      allSameExcept(executionEnvironment, {
        address: newAddress,
        isDelegateCall: true,
        calldata,
      }),
    );
  });

  it('New static call call should fork execution environment correctly', () => {
    const executionEnvironment = initExecutionEnvironment();
    const newExecutionEnvironment = executionEnvironment.deriveEnvironmentForNestedStaticCall(newAddress, calldata, FunctionSelector.empty());

    expect(newExecutionEnvironment).toEqual(
      allSameExcept(executionEnvironment, {
        address: newAddress,
        storageAddress: newAddress,
        isStaticCall: true,
        calldata,
      }),
    );
  });
});
