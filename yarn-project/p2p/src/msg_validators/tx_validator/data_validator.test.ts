import { MAX_CONTRACT_CLASS_LOGS_PER_TX, MAX_FR_CALLDATA_TO_ALL_ENQUEUED_CALLS } from '@aztec/constants';
import { timesParallel } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { ScopedLogHash } from '@aztec/stdlib/kernel';
import { ContractClassLog } from '@aztec/stdlib/logs';
import { mockTx } from '@aztec/stdlib/testing';
import {
  TX_ERROR_CALLDATA_COUNT_MISMATCH,
  TX_ERROR_CALLDATA_COUNT_TOO_LARGE,
  TX_ERROR_CONTRACT_CLASS_LOGS,
  TX_ERROR_CONTRACT_CLASS_LOG_COUNT,
  TX_ERROR_CONTRACT_CLASS_LOG_LENGTH,
  TX_ERROR_INCORRECT_CALLDATA,
  type Tx,
} from '@aztec/stdlib/tx';

import { DataTxValidator } from './data_validator.js';

const mockTxs = (numTxs: number) =>
  timesParallel(numTxs, i =>
    mockTx(i, {
      numberOfNonRevertiblePublicCallRequests: 2,
      numberOfRevertiblePublicCallRequests: 2,
      hasPublicTeardownCallRequest: true,
    }),
  );

// Added separately to avoid slowing down test with large CC logs when not required.
const mockTxsWithCCLog = (numTxs: number) =>
  timesParallel(numTxs, async i => {
    const tx = await mockTx(i, {
      numberOfNonRevertiblePublicCallRequests: 2,
      numberOfRevertiblePublicCallRequests: 2,
      hasPublicTeardownCallRequest: true,
    });
    const contractClassLogs = await Promise.all(
      Array(MAX_CONTRACT_CLASS_LOGS_PER_TX).fill(0).map(ContractClassLog.random),
    );
    const logHashes = await Promise.all(
      contractClassLogs.map(async l =>
        ScopedLogHash.fromFields([
          await l.hash(),
          new Fr(i + 3),
          new Fr(l.getEmittedLength()),
          (await AztecAddress.random()).toField(),
        ]),
      ),
    );
    tx.contractClassLogs.push(...contractClassLogs);
    logHashes.forEach((hash, i) => (tx.data.forPublic!.nonRevertibleAccumulatedData.contractClassLogsHashes[i] = hash));
    return tx;
  });

describe('TxDataValidator', () => {
  let validator: DataTxValidator;

  beforeEach(() => {
    validator = new DataTxValidator();
  });

  const expectValid = async (txs: Tx[]) => {
    for (const tx of txs) {
      await expect(validator.validateTx(tx)).resolves.toEqual({ result: 'valid' });
    }
  };

  const expectInvalid = async (tx: Tx, reason: string) => {
    await expect(validator.validateTx(tx)).resolves.toEqual({ result: 'invalid', reason: [reason] });
  };

  it('allows transactions with the correct data', async () => {
    const [tx] = await mockTxs(1);
    await expect(validator.validateTx(tx)).resolves.toEqual({ result: 'valid' });
    const [txWithLog] = await mockTxsWithCCLog(1);
    await expect(validator.validateTx(txWithLog)).resolves.toEqual({ result: 'valid' });
  });

  it('accept txs with exactly max calldata', async () => {
    const goodTx0Settings = {
      numberOfNonRevertiblePublicCallRequests: 1,
      numberOfRevertiblePublicCallRequests: 1,
      hasPublicTeardownCallRequest: false,
      publicCalldataSize: MAX_FR_CALLDATA_TO_ALL_ENQUEUED_CALLS / 2,
    };
    const goodTx0 = await mockTx(1, goodTx0Settings);

    await expectValid([goodTx0]);
  });

  it('rejects txs with too much calldata', async () => {
    const badTxSettings = [
      {
        numberOfNonRevertiblePublicCallRequests: 1,
        numberOfRevertiblePublicCallRequests: 1,
        hasPublicTeardownCallRequest: true,
        publicCalldataSize: MAX_FR_CALLDATA_TO_ALL_ENQUEUED_CALLS / 2,
      },
      {
        numberOfNonRevertiblePublicCallRequests: 0,
        numberOfRevertiblePublicCallRequests: 1,
        hasPublicTeardownCallRequest: false,
        publicCalldataSize: MAX_FR_CALLDATA_TO_ALL_ENQUEUED_CALLS + 1,
      },
    ];

    for (let i = 0; i < badTxSettings.length; i++) {
      const badTx = await mockTx(2, badTxSettings[i]);
      await expectInvalid(badTx, TX_ERROR_CALLDATA_COUNT_TOO_LARGE);
    }
  });

  it('rejects txs with mismatch calldata for non revertible public calls', async () => {
    const goodTxs = await mockTxs(3);
    const badTxs = await mockTxs(2);
    badTxs[0].data.forPublic!.nonRevertibleAccumulatedData.publicCallRequests[0].calldataHash = Fr.random();
    badTxs[1].publicFunctionCalldata[0].values[0] = Fr.random();

    await expectValid(goodTxs);

    await expectInvalid(badTxs[0], TX_ERROR_INCORRECT_CALLDATA);
    await expectInvalid(badTxs[1], TX_ERROR_INCORRECT_CALLDATA);
  });

  it('rejects txs with mismatch calldata for revertible public calls', async () => {
    const goodTxs = await mockTxs(3);
    const badTxs = await mockTxs(2);
    badTxs[0].data.forPublic!.revertibleAccumulatedData.publicCallRequests[0].calldataHash = Fr.random();
    badTxs[1].publicFunctionCalldata.at(-2)!.values[0] = Fr.random();

    await expectValid(goodTxs);

    await expectInvalid(badTxs[0], TX_ERROR_INCORRECT_CALLDATA);
    await expectInvalid(badTxs[1], TX_ERROR_INCORRECT_CALLDATA);
  });

  it('rejects txs with mismatch calldata for teardown call', async () => {
    const goodTxs = await mockTxs(3);
    const badTxs = await mockTxs(2);
    badTxs[0].data.forPublic!.publicTeardownCallRequest.calldataHash = Fr.random();
    badTxs[1].publicFunctionCalldata.at(-1)!.values[0] = Fr.random();

    await expectValid(goodTxs);

    await expectInvalid(badTxs[0], TX_ERROR_INCORRECT_CALLDATA);
    await expectInvalid(badTxs[1], TX_ERROR_INCORRECT_CALLDATA);
  });

  it('rejects txs with mismatch number of calldata', async () => {
    const goodTxs = await mockTxs(3);
    const badTxs = await mockTxs(2);
    // Missing a calldata.
    const calldata = badTxs[0].publicFunctionCalldata.pop()!;
    // Having an extra calldata.
    badTxs[1].publicFunctionCalldata.push(calldata);

    await expectValid(goodTxs);

    await expectInvalid(badTxs[0], TX_ERROR_CALLDATA_COUNT_MISMATCH);
    await expectInvalid(badTxs[1], TX_ERROR_CALLDATA_COUNT_MISMATCH);
  });

  it('rejects txs with mismatch number of contract class logs', async () => {
    const goodTxs = await mockTxsWithCCLog(3);
    const badTxs = await mockTxsWithCCLog(2);
    // Missing log hashes/log.
    badTxs[0].data.forPublic!.nonRevertibleAccumulatedData.contractClassLogsHashes[
      badTxs[0].contractClassLogs.length - 1
    ] = ScopedLogHash.empty();
    badTxs[1].contractClassLogs.pop();
    // Extra log hashes/log.
    // Can uncomment below if MAX_CONTRACT_CLASS_LOGS_PER_TX > 1 and we do not fill a tx's logs in mockTxsWithCCLog:
    // const extraLogHash = goodTxs[0].data.forPublic!.nonRevertibleAccumulatedData.contractClassLogsHashes[0];
    // badTxs[2].data.forPublic!.nonRevertibleAccumulatedData.contractClassLogsHashes[badTxs[2].contractClassLogs.length] = extraLogHash;
    // const extraLog = goodTxs[0].contractClassLogs[0];
    // badTxs[3].contractClassLogs.push(extraLog);

    await expectValid(goodTxs);

    await expectInvalid(badTxs[0], TX_ERROR_CONTRACT_CLASS_LOG_COUNT);
    await expectInvalid(badTxs[1], TX_ERROR_CONTRACT_CLASS_LOG_COUNT);
  });

  // Can uncomment below if MAX_CONTRACT_CLASS_LOGS_PER_TX > 1:
  // it('rejects txs with unsorted contract class logs', async () => {
  //   const goodTxs = await mockTxsWithCCLog(3);
  //   const badTxs = await mockTxsWithCCLog(2);
  //   // Unsorted logHash.
  //   badTxs[0].data.forPublic!.nonRevertibleAccumulatedData.contractClassLogsHashes[1] = badTxs[0].data.forPublic!.nonRevertibleAccumulatedData.contractClassLogsHashes[0];
  //   badTxs[0].data.forPublic!.nonRevertibleAccumulatedData.contractClassLogsHashes[0] = ScopedLogHash.empty();
  //   // Unsorted log.
  //   badTxs[1].contractClassLogs[1] ? badTxs[1].contractClassLogs[1] =  badTxs[1].contractClassLogs[0] : badTxs[1].contractClassLogs.push(badTxs[1].contractClassLogs[0]);
  //   badTxs[1].contractClassLogs[0] = ContractClassLog.empty();

  //   await expectValid(goodTxs);

  //   await expectInvalid(badTxs[0], 'Incorrectly sorted contract class logs');
  //   await expectInvalid(badTxs[1], 'Incorrectly sorted contract class logs');
  // });

  it('rejects txs with mismatched contract class logs', async () => {
    const goodTxs = await mockTxsWithCCLog(3);
    const badTxs = await mockTxsWithCCLog(2);

    const badLogHash = badTxs[0].data.forPublic!.nonRevertibleAccumulatedData.contractClassLogsHashes[0];
    badLogHash.logHash.value = badLogHash.value.add(Fr.ONE);
    badTxs[0].data.forPublic!.nonRevertibleAccumulatedData.contractClassLogsHashes[0] = badLogHash;
    badTxs[1].contractClassLogs[0].fields[0] = badTxs[1].contractClassLogs[0].fields[0].add(Fr.ONE);

    await expectValid(goodTxs);

    await expectInvalid(badTxs[0], TX_ERROR_CONTRACT_CLASS_LOGS);
    await expectInvalid(badTxs[1], TX_ERROR_CONTRACT_CLASS_LOGS);
  });

  it('rejects txs with mismatched contract class logs length', async () => {
    const goodTxs = await mockTxsWithCCLog(3);
    const badTxs = await mockTxsWithCCLog(2);

    badTxs[0].data.forPublic!.nonRevertibleAccumulatedData.contractClassLogsHashes[0].logHash.length += 1;
    // Note: changing the raw log to be longer/shorter results in an incorrect hash, which throws first.
    badTxs[1].contractClassLogs[0].fields[badTxs[1].contractClassLogs[0].getEmittedLength()] = Fr.ONE;
    badTxs[1].data.forPublic!.nonRevertibleAccumulatedData.contractClassLogsHashes[0].logHash.value =
      await badTxs[1].contractClassLogs[0].hash();

    await expectValid(goodTxs);

    await expectInvalid(badTxs[0], TX_ERROR_CONTRACT_CLASS_LOG_LENGTH);
    await expectInvalid(badTxs[1], TX_ERROR_CONTRACT_CLASS_LOG_LENGTH);
  });
});
