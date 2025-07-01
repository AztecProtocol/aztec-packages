import { Fr } from '@aztec/foundation/fields';
import type { FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { makeAztecAddress, makeSelector, mockTx } from '@aztec/stdlib/testing';
import { TX_ERROR_SETUP_FUNCTION_NOT_ALLOWED, type Tx } from '@aztec/stdlib/tx';

import { type MockProxy, mock, mockFn } from 'jest-mock-extended';

import { PhasesTxValidator } from './phases_validator.js';
import { patchNonRevertibleFn } from './test_utils.js';

describe('PhasesTxValidator', () => {
  const timestamp = 27n;
  let contractDataSource: MockProxy<ContractDataSource>;
  let txValidator: PhasesTxValidator;
  let allowedContractClass: Fr;
  let allowedContract: AztecAddress;
  let allowedSetupSelector1: FunctionSelector;
  let allowedSetupSelector2: FunctionSelector;

  const expectValid = async (tx: Tx) => {
    await expect(txValidator.validateTx(tx)).resolves.toEqual({ result: 'valid' });
  };

  const expectInvalid = async (tx: Tx, reason: string) => {
    await expect(txValidator.validateTx(tx)).resolves.toEqual({ result: 'invalid', reason: [reason] });
  };

  beforeEach(() => {
    allowedContractClass = Fr.random();
    allowedContract = makeAztecAddress();
    allowedSetupSelector1 = makeSelector(1);
    allowedSetupSelector2 = makeSelector(2);

    contractDataSource = mock<ContractDataSource>({
      getContract: mockFn().mockImplementation((_address, atTimestamp) => {
        if (timestamp !== atTimestamp) {
          throw new Error('Unexpected timestamp');
        }
        return {
          currentContractClassId: Fr.random(),
          originalContractClassId: Fr.random(),
        };
      }),
    });

    txValidator = new PhasesTxValidator(
      contractDataSource,
      [
        {
          classId: allowedContractClass,
          selector: allowedSetupSelector1,
        },
        {
          address: allowedContract,
          selector: allowedSetupSelector1,
        },
        {
          classId: allowedContractClass,
          selector: allowedSetupSelector2,
        },
        {
          address: allowedContract,
          selector: allowedSetupSelector2,
        },
      ],
      timestamp,
    );
  });

  it('allows setup functions on the contracts allow list', async () => {
    const tx = await mockTx(1, { numberOfNonRevertiblePublicCallRequests: 1 });
    await patchNonRevertibleFn(tx, 0, { address: allowedContract, selector: allowedSetupSelector1 });

    await expectValid(tx);
  });

  it('allows setup functions on the contracts class allow list', async () => {
    const tx = await mockTx(1, { numberOfNonRevertiblePublicCallRequests: 1 });
    const address = await patchNonRevertibleFn(tx, 0, { selector: allowedSetupSelector1 });

    contractDataSource.getContract.mockImplementationOnce((contractAddress, atTimestamp) => {
      if (timestamp !== atTimestamp) {
        throw new Error('Unexpected timestamp');
      }
      if (address.equals(contractAddress)) {
        return Promise.resolve({
          currentContractClassId: allowedContractClass,
          originalContractClassId: Fr.random(),
        } as any);
      } else {
        return Promise.resolve(undefined);
      }
    });

    await expectValid(tx);
  });

  it('rejects txs with setup functions not on the allow list', async () => {
    const tx = await mockTx(1, { numberOfNonRevertiblePublicCallRequests: 2 });

    await expectInvalid(tx, TX_ERROR_SETUP_FUNCTION_NOT_ALLOWED);
  });

  it('rejects setup functions not on the contracts class list', async () => {
    const tx = await mockTx(1, { numberOfNonRevertiblePublicCallRequests: 1 });
    // good selector, bad contract class
    const address = await patchNonRevertibleFn(tx, 0, { selector: allowedSetupSelector1 });
    contractDataSource.getContract.mockImplementationOnce((contractAddress, atTimestamp) => {
      if (timestamp !== atTimestamp) {
        throw new Error('Unexpected timestamp');
      }
      if (address.equals(contractAddress)) {
        return Promise.resolve({
          currentContractClassId: Fr.random(),
          originalContractClassId: Fr.random(),
        } as any);
      } else {
        return Promise.resolve(undefined);
      }
    });

    await expectInvalid(tx, TX_ERROR_SETUP_FUNCTION_NOT_ALLOWED);
  });

  it('allows multiple setup functions on the allow list', async () => {
    const tx = await mockTx(1, { numberOfNonRevertiblePublicCallRequests: 2 });
    await patchNonRevertibleFn(tx, 0, { address: allowedContract, selector: allowedSetupSelector1 });
    await patchNonRevertibleFn(tx, 1, { address: allowedContract, selector: allowedSetupSelector2 });

    await expectValid(tx);
  });

  it('rejects if one setup functions is not on the allow list', async () => {
    const tx = await mockTx(1, { numberOfNonRevertiblePublicCallRequests: 2 });
    await patchNonRevertibleFn(tx, 0, { address: allowedContract, selector: allowedSetupSelector1 });

    await expectInvalid(tx, TX_ERROR_SETUP_FUNCTION_NOT_ALLOWED);
  });
});
