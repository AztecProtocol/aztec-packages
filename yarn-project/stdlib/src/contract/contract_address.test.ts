import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { elapsed } from '@aztec/foundation/timer';

import { type FunctionAbi, FunctionType } from '../abi/index.js';
import { AztecAddress } from '../aztec-address/index.js';
import { deriveKeys } from '../keys/derivation.js';
import {
  computeContractAddressFromInstance,
  computeInitializationHash,
  computePartialAddress,
  computeSaltedInitializationHash,
} from './contract_address.js';

describe('ContractAddress', () => {
  it('computePartialAddress', async () => {
    const mockInstance = {
      originalContractClassId: new Fr(1),
      saltedInitializationHash: new Fr(2),
    };
    const result = await computePartialAddress(mockInstance);
    expect(result.toString()).toMatchInlineSnapshot(
      `"0x2f43fe475e50f6066260038fd16fa97029a76395b2d38388808e60bc24651a0c"`,
    );
  });
  it('computeSaltedInitializationHash', async () => {
    const mockInstance = {
      initializationHash: new Fr(1),
      salt: new Fr(2),
      deployer: AztecAddress.fromFieldUnsafe(new Fr(4)),
      immutablesHash: new Fr(3),
    };
    const result = await computeSaltedInitializationHash(mockInstance);
    expect(result.toString()).toMatchInlineSnapshot(
      `"0x093c5f7e0d5a56a1fce27bb347233fd1884db1ff78573c5b9b2de9d3fe8babe1"`,
    );
  });
  it('computeInitializationHash', async () => {
    const mockInitFn: FunctionAbi = {
      functionType: FunctionType.PRIVATE,
      isInitializer: false,
      isOnlySelf: false,
      isStatic: false,
      name: 'fun',
      parameters: [{ name: 'param1', type: { kind: 'boolean' }, visibility: 'private' }],
      errorTypes: {},
    };
    const mockArgs: any[] = [true];
    const result = await computeInitializationHash(mockInitFn, mockArgs);
    expect(result.toString()).toMatchInlineSnapshot(
      `"0x08b683284b4344302193cb36c05f043d4225e2d88d9e0f6ffde12547098cab98"`,
    );
  });
  it('computeInitializationHash empty', async () => {
    const result = await computeInitializationHash(undefined, []);
    expect(result).toEqual(Fr.ZERO);
  });
  it('computeContractAddressFromInstance', async () => {
    const secretKey = new Fr(2n);
    const salt = new Fr(3n);
    const contractClassId = new Fr(4n);
    const initializationHash = new Fr(5n);
    const immutablesHash = new Fr(6n);
    const deployer = AztecAddress.fromFieldUnsafe(new Fr(7));
    const publicKeys = (await deriveKeys(secretKey)).publicKeys;
    const instance = {
      publicKeys,
      salt,
      originalContractClassId: contractClassId,
      currentContractClassId: contractClassId,
      initializationHash,
      deployer,
      immutablesHash,
      version: 2 as const,
    };
    const [ms, address] = await elapsed(computeContractAddressFromInstance(instance));
    const logger = createLogger('stdlib:contract_address:test');
    logger.info(`Computed contract address from instance in ${ms}ms`);
    expect(address.toString()).toMatchInlineSnapshot(
      `"0x0c295919fa5b94d9b9fa5e24e9cef2e8e757c17e2cecd366055571c88d9e2a44"`,
    );
  });
});
