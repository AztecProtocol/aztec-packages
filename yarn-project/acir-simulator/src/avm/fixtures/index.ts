// Place large AVM text fixtures in here
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';

import { ExecutionEnvironment } from '../avm_execution_environment.js';

export const initExecutionEnvironmentEmpty = (): ExecutionEnvironment => {
  return new ExecutionEnvironment(
    AztecAddress.zero(),
    AztecAddress.zero(),
    AztecAddress.zero(),
    AztecAddress.zero(),
    EthAddress.ZERO,
    Fr.zero(),
    Fr.zero(),
    Fr.zero(),
    Fr.zero(),
    false,
    false,
    [],
  );
};

export const initExecutionEnvironment = (contractAddress: AztecAddress): ExecutionEnvironment => {
  return new ExecutionEnvironment(
    contractAddress,
    contractAddress,
    AztecAddress.zero(),
    AztecAddress.zero(),
    EthAddress.ZERO,
    Fr.zero(),
    Fr.zero(),
    Fr.zero(),
    Fr.zero(),
    false,
    false,
    [],
  );
};
