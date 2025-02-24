import { type Tx } from '@aztec/circuit-types';
import { mockTx } from '@aztec/circuit-types/testing';
import { FunctionSelector } from '@aztec/circuits.js/abi';
import { AztecAddress } from '@aztec/circuits.js/aztec-address';
import { ScopedLogHash } from '@aztec/circuits.js/kernel';
import { ContractClassLog } from '@aztec/circuits.js/logs';
import { MAX_CONTRACT_CLASS_LOGS_PER_TX } from '@aztec/constants';
import { timesParallel } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';

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

  it('rejects txs with mismatch non revertible execution requests', async () => {
    const goodTxs = await mockTxs(3);
    const badTxs = await mockTxs(2);
    badTxs[0].data.forPublic!.nonRevertibleAccumulatedData.publicCallRequests[0].argsHash = Fr.random();
    badTxs[1].data.forPublic!.nonRevertibleAccumulatedData.publicCallRequests[1].contractAddress =
      await AztecAddress.random();

    await expectValid(goodTxs);

    await expectInvalid(badTxs[0], 'Incorrect execution request for public call');
    await expectInvalid(badTxs[1], 'Incorrect execution request for public call');
  });

  it('rejects txs with mismatch revertible execution requests', async () => {
    const goodTxs = await mockTxs(3);
    const badTxs = await mockTxs(4);
    badTxs[0].data.forPublic!.revertibleAccumulatedData.publicCallRequests[0].msgSender = await AztecAddress.random();
    badTxs[1].data.forPublic!.revertibleAccumulatedData.publicCallRequests[1].contractAddress =
      await AztecAddress.random();
    badTxs[2].data.forPublic!.revertibleAccumulatedData.publicCallRequests[0].functionSelector =
      FunctionSelector.random();
    badTxs[3].data.forPublic!.revertibleAccumulatedData.publicCallRequests[0].isStaticCall =
      !badTxs[3].enqueuedPublicFunctionCalls[0].callContext.isStaticCall;

    await expectValid(goodTxs);

    await expectInvalid(badTxs[0], 'Incorrect execution request for public call');
    await expectInvalid(badTxs[1], 'Incorrect execution request for public call');
    await expectInvalid(badTxs[2], 'Incorrect execution request for public call');
    await expectInvalid(badTxs[3], 'Incorrect execution request for public call');
  });

  it('rejects txs with mismatch teardown execution requests', async () => {
    const goodTxs = await mockTxs(3);
    const badTxs = await mockTxs(2);
    badTxs[0].data.forPublic!.publicTeardownCallRequest.contractAddress = await AztecAddress.random();
    badTxs[1].data.forPublic!.publicTeardownCallRequest.msgSender = await AztecAddress.random();

    await expectValid(goodTxs);

    await expectInvalid(badTxs[0], 'Incorrect teardown execution request');
    await expectInvalid(badTxs[1], 'Incorrect teardown execution request');
  });

  it('rejects txs with mismatch number of execution requests', async () => {
    const goodTxs = await mockTxs(3);
    const badTxs = await mockTxs(2);
    // Missing an enqueuedPublicFunctionCall.
    const execRequest = badTxs[0].enqueuedPublicFunctionCalls.pop()!;
    // Having an extra enqueuedPublicFunctionCall.
    badTxs[1].enqueuedPublicFunctionCalls.push(execRequest);

    await expectValid(goodTxs);

    await expectInvalid(badTxs[0], 'Wrong number of execution requests for public calls');
    await expectInvalid(badTxs[1], 'Wrong number of execution requests for public calls');
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

    await expectInvalid(badTxs[0], 'Mismatched number of contract class logs');
    await expectInvalid(badTxs[1], 'Mismatched number of contract class logs');
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

    await expectInvalid(badTxs[0], 'Mismatched contract class logs');
    await expectInvalid(badTxs[1], 'Mismatched contract class logs');
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

    await expectInvalid(badTxs[0], 'Mismatched contract class logs length');
    await expectInvalid(badTxs[1], 'Mismatched contract class logs length');
  });
});
