import { type Tx, mockTx } from '@aztec/circuit-types';
import { type AztecAddress, type ContractDataSource, Fr, type FunctionSelector } from '@aztec/circuits.js';
import { makeAztecAddress, makeSelector } from '@aztec/circuits.js/testing';

import { type MockProxy, mock, mockFn } from 'jest-mock-extended';

import { PhasesTxValidator } from './phases_validator.js';
import { patchNonRevertibleFn } from './test_utils.js';

describe('PhasesTxValidator', () => {
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
      getContract: mockFn().mockImplementation(() => {
        return {
          contractClassId: Fr.random(),
        };
      }),
    });

    txValidator = new PhasesTxValidator(contractDataSource, [
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
    ]);
  });

  it('allows setup functions on the contracts allow list', async () => {
    const tx = mockTx(1, { numberOfNonRevertiblePublicCallRequests: 1 });
    patchNonRevertibleFn(tx, 0, { address: allowedContract, selector: allowedSetupSelector1 });

    await expectValid(tx);
  });

  it('allows setup functions on the contracts class allow list', async () => {
    const tx = mockTx(1, { numberOfNonRevertiblePublicCallRequests: 1 });
    const { address } = patchNonRevertibleFn(tx, 0, { selector: allowedSetupSelector1 });

    contractDataSource.getContract.mockImplementationOnce(contractAddress => {
      if (address.equals(contractAddress)) {
        return Promise.resolve({
          contractClassId: allowedContractClass,
        } as any);
      } else {
        return Promise.resolve(undefined);
      }
    });

    await expectValid(tx);
  });

  it('rejects txs with setup functions not on the allow list', async () => {
    const tx = mockTx(1, { numberOfNonRevertiblePublicCallRequests: 2 });

    await expectInvalid(tx, 'Setup function not on allow list');
  });

  it('rejects setup functions not on the contracts class list', async () => {
    const tx = mockTx(1, { numberOfNonRevertiblePublicCallRequests: 1 });
    // good selector, bad contract class
    const { address } = patchNonRevertibleFn(tx, 0, { selector: allowedSetupSelector1 });
    contractDataSource.getContract.mockImplementationOnce(contractAddress => {
      if (address.equals(contractAddress)) {
        return Promise.resolve({
          contractClassId: Fr.random(),
        } as any);
      } else {
        return Promise.resolve(undefined);
      }
    });

    await expectInvalid(tx, 'Setup function not on allow list');
  });

  it('allows multiple setup functions on the allow list', async () => {
    const tx = mockTx(1, { numberOfNonRevertiblePublicCallRequests: 2 });
    patchNonRevertibleFn(tx, 0, { address: allowedContract, selector: allowedSetupSelector1 });
    patchNonRevertibleFn(tx, 1, { address: allowedContract, selector: allowedSetupSelector2 });

    await expectValid(tx);
  });

  it('rejects if one setup functions is not on the allow list', async () => {
    const tx = mockTx(1, { numberOfNonRevertiblePublicCallRequests: 2 });
    patchNonRevertibleFn(tx, 0, { address: allowedContract, selector: allowedSetupSelector1 });

    await expectInvalid(tx, 'Setup function not on allow list');
  });
});
