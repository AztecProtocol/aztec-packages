import { Fr } from '@aztec/foundation/fields';
import { setupCustomSnapshotSerializers } from '@aztec/foundation/testing';

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
  setupCustomSnapshotSerializers(expect);
  it('computePartialAddress', async () => {
    const mockInstance = {
      originalContractClassId: new Fr(1),
      saltedInitializationHash: new Fr(2),
    };
    const result = await computePartialAddress(mockInstance);
    expect(result).toMatchSnapshot();
  });

  it('computeSaltedInitializationHash', async () => {
    const mockInstance = {
      initializationHash: new Fr(1),
      salt: new Fr(2),
      deployer: AztecAddress.fromField(new Fr(4)),
    };
    const result = await computeSaltedInitializationHash(mockInstance);
    expect(result).toMatchSnapshot();
  });

  it('computeInitializationHash', async () => {
    const mockInitFn: FunctionAbi = {
      functionType: FunctionType.PRIVATE,
      isInitializer: false,
      isInternal: false,
      isStatic: false,
      name: 'fun',
      parameters: [{ name: 'param1', type: { kind: 'boolean' }, visibility: 'private' }],
      returnTypes: [],
      errorTypes: {},
    };
    const mockArgs: any[] = [true];
    const result = await computeInitializationHash(mockInitFn, mockArgs);
    expect(result).toMatchSnapshot();
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
    const deployer = AztecAddress.fromField(new Fr(7));
    const publicKeys = (await deriveKeys(secretKey)).publicKeys;

    const address = (
      await computeContractAddressFromInstance({
        publicKeys,
        salt,
        originalContractClassId: contractClassId,
        currentContractClassId: contractClassId,
        initializationHash,
        deployer,
        version: 1,
      })
    ).toString();

    expect(address).toMatchSnapshot();
  });
});
