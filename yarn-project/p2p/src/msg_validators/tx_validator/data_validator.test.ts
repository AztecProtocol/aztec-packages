import { type Tx, mockTx } from '@aztec/circuit-types';
import { AztecAddress, Fr, FunctionSelector } from '@aztec/circuits.js';

import { DataTxValidator } from './data_validator.js';

const mockTxs = (numTxs: number) =>
  Array(numTxs)
    .fill(0)
    .map((_, i) =>
      mockTx(i, {
        numberOfNonRevertiblePublicCallRequests: 2,
        numberOfRevertiblePublicCallRequests: 2,
        hasPublicTeardownCallRequest: true,
      }),
    );

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
    const [tx] = mockTxs(1);
    await expect(validator.validateTx(tx)).resolves.toEqual({ result: 'valid' });
  });

  it('rejects txs with mismatch non revertible execution requests', async () => {
    const goodTxs = mockTxs(3);
    const badTxs = mockTxs(2);
    badTxs[0].data.forPublic!.nonRevertibleAccumulatedData.publicCallRequests[0].argsHash = Fr.random();
    badTxs[1].data.forPublic!.nonRevertibleAccumulatedData.publicCallRequests[1].contractAddress =
      AztecAddress.random();

    await expectValid(goodTxs);

    await expectInvalid(badTxs[0], 'Incorrect execution request for public call');
    await expectInvalid(badTxs[1], 'Incorrect execution request for public call');
  });

  it('rejects txs with mismatch revertible execution requests', async () => {
    const goodTxs = mockTxs(3);
    const badTxs = mockTxs(4);
    badTxs[0].data.forPublic!.revertibleAccumulatedData.publicCallRequests[0].msgSender = AztecAddress.random();
    badTxs[1].data.forPublic!.revertibleAccumulatedData.publicCallRequests[1].contractAddress = AztecAddress.random();
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
    const goodTxs = mockTxs(3);
    const badTxs = mockTxs(2);
    badTxs[0].data.forPublic!.publicTeardownCallRequest.contractAddress = AztecAddress.random();
    badTxs[1].data.forPublic!.publicTeardownCallRequest.msgSender = AztecAddress.random();

    await expectValid(goodTxs);

    await expectInvalid(badTxs[0], 'Incorrect teardown execution request');
    await expectInvalid(badTxs[1], 'Incorrect teardown execution request');
  });

  it('rejects txs with mismatch number of execution requests', async () => {
    const goodTxs = mockTxs(3);
    const badTxs = mockTxs(2);
    // Missing an enqueuedPublicFunctionCall.
    const execRequest = badTxs[0].enqueuedPublicFunctionCalls.pop()!;
    // Having an extra enqueuedPublicFunctionCall.
    badTxs[1].enqueuedPublicFunctionCalls.push(execRequest);

    await expectValid(goodTxs);

    await expectInvalid(badTxs[0], 'Wrong number of execution requests for public calls');
    await expectInvalid(badTxs[1], 'Wrong number of execution requests for public calls');
  });
});
