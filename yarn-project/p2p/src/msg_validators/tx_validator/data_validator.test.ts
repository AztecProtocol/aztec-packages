import { type Tx } from '@aztec/circuit-types';
import { mockTx } from '@aztec/circuit-types/testing';
import { FunctionSelector } from '@aztec/circuits.js/abi';
import { AztecAddress } from '@aztec/circuits.js/aztec-address';
import { computeVarArgsHash } from '@aztec/circuits.js/hash';
import { MAX_ARGS_TO_ALL_ENQUEUED_CALLS } from '@aztec/constants';
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

// After modifying a mocked TX's enqueued calls, update its argsHash to match.
const fixPublicCallRequests = async (
  tx: Tx,
  {
    numberOfNonRevertiblePublicCallRequests = 0,
    numberOfRevertiblePublicCallRequests = 1,
    hasPublicTeardownCallRequest = false,
  },
) => {
  let indexOfExecutionRequest = 0;
  for (let i = 0; i < numberOfNonRevertiblePublicCallRequests; i++) {
    tx.data.forPublic!.nonRevertibleAccumulatedData.publicCallRequests[i].argsHash = await computeVarArgsHash(
      tx.enqueuedPublicFunctionCalls[indexOfExecutionRequest].args,
    );
    indexOfExecutionRequest++;
  }
  for (let i = 0; i < numberOfRevertiblePublicCallRequests; i++) {
    tx.data.forPublic!.revertibleAccumulatedData.publicCallRequests[i].argsHash = await computeVarArgsHash(
      tx.enqueuedPublicFunctionCalls[indexOfExecutionRequest].args,
    );
  }
  if (hasPublicTeardownCallRequest) {
    tx.data.forPublic!.publicTeardownCallRequest.argsHash = await computeVarArgsHash(
      tx.publicTeardownFunctionCall.args,
    );
  }
};

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
  });

  it('accept txs with exactly max args', async () => {
    const goodTx0Settings = {
      numberOfNonRevertiblePublicCallRequests: 0,
      numberOfRevertiblePublicCallRequests: 1,
      hasPublicTeardownCallRequest: false,
    };
    const goodTx0 = await mockTx(1, goodTx0Settings);
    goodTx0.enqueuedPublicFunctionCalls[0].args = Array.from(
      { length: MAX_ARGS_TO_ALL_ENQUEUED_CALLS },
      () => new Fr(1),
    );
    await fixPublicCallRequests(goodTx0, goodTx0Settings);

    await expectValid([goodTx0]);
  });

  it('rejects txs with too many args', async () => {
    const badTx0Settings = {
      numberOfNonRevertiblePublicCallRequests: 1,
      numberOfRevertiblePublicCallRequests: 1,
      hasPublicTeardownCallRequest: true,
    };
    const badTx0 = await mockTx(2, badTx0Settings);
    badTx0.enqueuedPublicFunctionCalls[0].args = Array.from(
      { length: MAX_ARGS_TO_ALL_ENQUEUED_CALLS / 2 },
      () => new Fr(1),
    );
    badTx0.enqueuedPublicFunctionCalls[1].args = Array.from(
      { length: MAX_ARGS_TO_ALL_ENQUEUED_CALLS / 2 },
      () => new Fr(1),
    );
    badTx0.publicTeardownFunctionCall.args = [new Fr(1)];
    await fixPublicCallRequests(badTx0, badTx0Settings);

    const badTx1Settings = {
      numberOfNonRevertiblePublicCallRequests: 0,
      numberOfRevertiblePublicCallRequests: 1,
      hasPublicTeardownCallRequest: false,
    };
    const badTx1 = await mockTx(3, badTx1Settings);
    badTx1.enqueuedPublicFunctionCalls[0].args = Array.from(
      { length: MAX_ARGS_TO_ALL_ENQUEUED_CALLS + 1 },
      () => new Fr(1),
    );
    await fixPublicCallRequests(badTx1, badTx1Settings);

    await expectInvalid(badTx0, 'Too many args in total to enqueued public calls');
    await expectInvalid(badTx1, 'Too many args in total to enqueued public calls');
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
});
