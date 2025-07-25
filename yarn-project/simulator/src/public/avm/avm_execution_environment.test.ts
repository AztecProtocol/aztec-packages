import { Fr } from '@aztec/foundation/fields';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { initExecutionEnvironment } from './fixtures/initializers.js';
import { allSameExcept } from './fixtures/utils.js';

describe('Execution Environment', () => {
  const newAddress = AztecAddress.fromNumber(123456);
  const calldata = [new Fr(1n), new Fr(2n), new Fr(3n)];

  it('New call should fork execution environment correctly', () => {
    const executionEnvironment = initExecutionEnvironment();
    const newExecutionEnvironment = executionEnvironment.deriveEnvironmentForNestedCall(newAddress, calldata);

    expect(newExecutionEnvironment).toEqual(
      allSameExcept(executionEnvironment, {
        address: newAddress,
        contractCallDepth: Fr.ONE,
        calldata: calldata,
      }),
    );
  });

  it('New static call should fork execution environment correctly', () => {
    const executionEnvironment = initExecutionEnvironment();
    const newExecutionEnvironment = executionEnvironment.deriveEnvironmentForNestedStaticCall(newAddress, calldata);

    expect(newExecutionEnvironment).toEqual(
      allSameExcept(executionEnvironment, {
        address: newAddress,
        contractCallDepth: Fr.ONE,
        isStaticCall: true,
        calldata: calldata,
      }),
    );
  });
});
