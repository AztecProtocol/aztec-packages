import { NULL_MSG_SENDER_CONTRACT_ADDRESS } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { FunctionSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { makeAztecAddress, makeSelector, mockTx } from '@aztec/stdlib/testing';
import {
  TX_ERROR_SETUP_FUNCTION_NOT_ALLOWED,
  TX_ERROR_SETUP_FUNCTION_UNKNOWN_CONTRACT,
  TX_ERROR_SETUP_NULL_MSG_SENDER,
  TX_ERROR_SETUP_ONLY_SELF_WRONG_SENDER,
  TX_ERROR_SETUP_WRONG_CALLDATA_LENGTH,
  type Tx,
} from '@aztec/stdlib/tx';

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

  it('rejects address match with wrong selector', async () => {
    const tx = await mockTx(1, { numberOfNonRevertiblePublicCallRequests: 1 });
    const wrongSelector = makeSelector(99);
    await patchNonRevertibleFn(tx, 0, { address: allowedContract, selector: wrongSelector });

    await expectInvalid(tx, TX_ERROR_SETUP_FUNCTION_NOT_ALLOWED);
  });

  it('rejects class match with wrong selector', async () => {
    const tx = await mockTx(1, { numberOfNonRevertiblePublicCallRequests: 1 });
    const wrongSelector = makeSelector(99);
    const address = await patchNonRevertibleFn(tx, 0, { selector: wrongSelector });

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

    await expectInvalid(tx, TX_ERROR_SETUP_FUNCTION_NOT_ALLOWED);
  });

  it('rejects with unknown contract error when contract is not found', async () => {
    const tx = await mockTx(1, { numberOfNonRevertiblePublicCallRequests: 1 });
    const address = await patchNonRevertibleFn(tx, 0, { selector: allowedSetupSelector1 });

    contractDataSource.getContract.mockImplementationOnce((contractAddress, atTimestamp) => {
      if (timestamp !== atTimestamp) {
        throw new Error('Unexpected timestamp');
      }
      if (address.equals(contractAddress)) {
        return Promise.resolve(undefined);
      }
      return Promise.resolve(undefined);
    });

    await expectInvalid(tx, TX_ERROR_SETUP_FUNCTION_UNKNOWN_CONTRACT);
  });

  it('does not fetch contract instance when matching by address', async () => {
    const tx = await mockTx(1, { numberOfNonRevertiblePublicCallRequests: 1 });
    await patchNonRevertibleFn(tx, 0, { address: allowedContract, selector: allowedSetupSelector1 });

    await expectValid(tx);

    expect(contractDataSource.getContract).not.toHaveBeenCalled();
  });

  describe('onlySelf validation', () => {
    let allowedOnlySelfSelector: FunctionSelector;
    let allowedOnlySelfContract: AztecAddress;
    let allowedOnlySelfClass: Fr;

    beforeEach(() => {
      allowedOnlySelfSelector = makeSelector(10);
      allowedOnlySelfContract = makeAztecAddress();
      allowedOnlySelfClass = Fr.random();

      txValidator = new PhasesTxValidator(
        contractDataSource,
        [
          {
            address: allowedOnlySelfContract,
            selector: allowedOnlySelfSelector,
            onlySelf: true,
          },
          {
            classId: allowedOnlySelfClass,
            selector: allowedOnlySelfSelector,
            onlySelf: true,
          },
          {
            address: allowedContract,
            selector: allowedSetupSelector1,
          },
        ],
        timestamp,
      );
    });

    it('allows onlySelf address entry when msgSender equals contractAddress', async () => {
      const tx = await mockTx(1, { numberOfNonRevertiblePublicCallRequests: 1 });
      await patchNonRevertibleFn(tx, 0, {
        address: allowedOnlySelfContract,
        selector: allowedOnlySelfSelector,
        msgSender: allowedOnlySelfContract,
      });

      await expectValid(tx);
    });

    it('rejects onlySelf address entry when msgSender differs from contractAddress', async () => {
      const tx = await mockTx(1, { numberOfNonRevertiblePublicCallRequests: 1 });
      await patchNonRevertibleFn(tx, 0, {
        address: allowedOnlySelfContract,
        selector: allowedOnlySelfSelector,
        msgSender: makeAztecAddress(999),
      });

      await expectInvalid(tx, TX_ERROR_SETUP_ONLY_SELF_WRONG_SENDER);
    });

    it('allows onlySelf class entry when msgSender equals contractAddress', async () => {
      const tx = await mockTx(1, { numberOfNonRevertiblePublicCallRequests: 1 });
      const address = await patchNonRevertibleFn(tx, 0, {
        selector: allowedOnlySelfSelector,
        msgSender: undefined, // will be patched below
      });

      // Patch msgSender to equal contractAddress
      tx.data.forPublic!.nonRevertibleAccumulatedData.publicCallRequests[0].msgSender = address;

      contractDataSource.getContract.mockImplementationOnce((contractAddress, atTimestamp) => {
        if (timestamp !== atTimestamp) {
          throw new Error('Unexpected timestamp');
        }
        if (address.equals(contractAddress)) {
          return Promise.resolve({
            currentContractClassId: allowedOnlySelfClass,
            originalContractClassId: Fr.random(),
          } as any);
        }
        return Promise.resolve(undefined);
      });

      await expectValid(tx);
    });

    it('rejects onlySelf class entry when msgSender differs from contractAddress', async () => {
      const tx = await mockTx(1, { numberOfNonRevertiblePublicCallRequests: 1 });
      const address = await patchNonRevertibleFn(tx, 0, {
        selector: allowedOnlySelfSelector,
        msgSender: makeAztecAddress(),
      });

      contractDataSource.getContract.mockImplementationOnce((contractAddress, atTimestamp) => {
        if (timestamp !== atTimestamp) {
          throw new Error('Unexpected timestamp');
        }
        if (address.equals(contractAddress)) {
          return Promise.resolve({
            currentContractClassId: allowedOnlySelfClass,
            originalContractClassId: Fr.random(),
          } as any);
        }
        return Promise.resolve(undefined);
      });

      await expectInvalid(tx, TX_ERROR_SETUP_ONLY_SELF_WRONG_SENDER);
    });

    it('allows non-onlySelf entry with different msgSender', async () => {
      const tx = await mockTx(1, { numberOfNonRevertiblePublicCallRequests: 1 });
      await patchNonRevertibleFn(tx, 0, {
        address: allowedContract,
        selector: allowedSetupSelector1,
        msgSender: makeAztecAddress(),
      });

      await expectValid(tx);
    });
  });

  describe('calldataLength validation', () => {
    const expectedLength = 4; // 1 selector + 3 args
    let calldataContract: AztecAddress;
    let calldataSelector: FunctionSelector;
    let calldataClassId: Fr;

    beforeEach(() => {
      calldataContract = makeAztecAddress(70);
      calldataSelector = makeSelector(70);
      calldataClassId = Fr.random();

      txValidator = new PhasesTxValidator(
        contractDataSource,
        [
          {
            address: calldataContract,
            selector: calldataSelector,
            calldataLength: expectedLength,
          },
          {
            classId: calldataClassId,
            selector: calldataSelector,
            calldataLength: expectedLength,
          },
        ],
        timestamp,
      );
    });

    it('allows address entry with correct calldata length', async () => {
      const tx = await mockTx(1, { numberOfNonRevertiblePublicCallRequests: 1 });
      await patchNonRevertibleFn(tx, 0, {
        address: calldataContract,
        selector: calldataSelector,
        args: [Fr.random(), Fr.random(), Fr.random()],
      });

      await expectValid(tx);
    });

    it('rejects address entry with too short calldata', async () => {
      const tx = await mockTx(1, { numberOfNonRevertiblePublicCallRequests: 1 });
      await patchNonRevertibleFn(tx, 0, {
        address: calldataContract,
        selector: calldataSelector,
        args: [Fr.random()],
      });

      await expectInvalid(tx, TX_ERROR_SETUP_WRONG_CALLDATA_LENGTH);
    });

    it('rejects address entry with too long calldata', async () => {
      const tx = await mockTx(1, { numberOfNonRevertiblePublicCallRequests: 1 });
      await patchNonRevertibleFn(tx, 0, {
        address: calldataContract,
        selector: calldataSelector,
        args: [Fr.random(), Fr.random(), Fr.random(), Fr.random(), Fr.random()],
      });

      await expectInvalid(tx, TX_ERROR_SETUP_WRONG_CALLDATA_LENGTH);
    });

    it('rejects class entry with wrong calldata length', async () => {
      const tx = await mockTx(1, { numberOfNonRevertiblePublicCallRequests: 1 });
      const address = await patchNonRevertibleFn(tx, 0, {
        selector: calldataSelector,
        args: [Fr.random()],
      });

      contractDataSource.getContract.mockImplementationOnce((contractAddress, atTimestamp) => {
        if (timestamp !== atTimestamp) {
          throw new Error('Unexpected timestamp');
        }
        if (address.equals(contractAddress)) {
          return Promise.resolve({
            currentContractClassId: calldataClassId,
            originalContractClassId: Fr.random(),
          } as any);
        }
        return Promise.resolve(undefined);
      });

      await expectInvalid(tx, TX_ERROR_SETUP_WRONG_CALLDATA_LENGTH);
    });

    it('allows any calldata length when calldataLength is not set', async () => {
      txValidator = new PhasesTxValidator(
        contractDataSource,
        [
          {
            address: calldataContract,
            selector: calldataSelector,
          },
        ],
        timestamp,
      );

      const tx = await mockTx(1, { numberOfNonRevertiblePublicCallRequests: 1 });
      await patchNonRevertibleFn(tx, 0, {
        address: calldataContract,
        selector: calldataSelector,
        args: [Fr.random(), Fr.random(), Fr.random(), Fr.random(), Fr.random(), Fr.random()],
      });

      await expectValid(tx);
    });
  });

  describe('rejectNullMsgSender validation', () => {
    const nullMsgSender = AztecAddress.fromBigIntUnsafe(NULL_MSG_SENDER_CONTRACT_ADDRESS);
    let rejectNullContract: AztecAddress;
    let rejectNullSelector: FunctionSelector;
    let noRejectNullContract: AztecAddress;
    let noRejectNullSelector: FunctionSelector;

    beforeEach(() => {
      rejectNullContract = makeAztecAddress(50);
      rejectNullSelector = makeSelector(50);
      noRejectNullContract = makeAztecAddress(51);
      noRejectNullSelector = makeSelector(51);

      txValidator = new PhasesTxValidator(
        contractDataSource,
        [
          {
            address: rejectNullContract,
            selector: rejectNullSelector,
            rejectNullMsgSender: true,
          },
          {
            address: noRejectNullContract,
            selector: noRejectNullSelector,
          },
        ],
        timestamp,
      );
    });

    it('rejects when msgSender is NULL_MSG_SENDER_CONTRACT_ADDRESS', async () => {
      const tx = await mockTx(1, { numberOfNonRevertiblePublicCallRequests: 1 });
      await patchNonRevertibleFn(tx, 0, {
        address: rejectNullContract,
        selector: rejectNullSelector,
        msgSender: nullMsgSender,
      });

      await expectInvalid(tx, TX_ERROR_SETUP_NULL_MSG_SENDER);
    });

    it('allows when msgSender is a normal address', async () => {
      const tx = await mockTx(1, { numberOfNonRevertiblePublicCallRequests: 1 });
      await patchNonRevertibleFn(tx, 0, {
        address: rejectNullContract,
        selector: rejectNullSelector,
        msgSender: makeAztecAddress(100),
      });

      await expectValid(tx);
    });

    it('allows null msgSender on entries without the flag', async () => {
      const tx = await mockTx(1, { numberOfNonRevertiblePublicCallRequests: 1 });
      await patchNonRevertibleFn(tx, 0, {
        address: noRejectNullContract,
        selector: noRejectNullSelector,
        msgSender: nullMsgSender,
      });

      await expectValid(tx);
    });
  });
});
