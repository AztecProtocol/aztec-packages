import { Tx, type TxValidationResult, type TxValidator } from '@aztec/circuit-types';
import { MAX_ARGS_TO_ALL_ENQUEUED_CALLS } from '@aztec/constants';
import { createLogger } from '@aztec/foundation/log';

export class DataTxValidator implements TxValidator<Tx> {
  #log = createLogger('p2p:tx_validator:tx_data');

  validateTx(tx: Tx): Promise<TxValidationResult> {
    return this.#hasCorrectExecutionRequests(tx);
  }

  async #hasCorrectExecutionRequests(tx: Tx): Promise<TxValidationResult> {
    const callRequests = [
      ...tx.data.getRevertiblePublicCallRequests(),
      ...tx.data.getNonRevertiblePublicCallRequests(),
    ];
    if (callRequests.length !== tx.enqueuedPublicFunctionCalls.length) {
      this.#log.warn(
        `Rejecting tx ${Tx.getHash(tx)} because of mismatch number of execution requests for public calls. Expected ${
          callRequests.length
        }. Got ${tx.enqueuedPublicFunctionCalls.length}.`,
      );
      return { result: 'invalid', reason: ['Wrong number of execution requests for public calls'] };
    }

    const totalArgsLength = tx.enqueuedPublicFunctionCalls.reduce(
      (acc, execRequest) => acc + execRequest.args.length,
      0,
    );
    if (totalArgsLength > MAX_ARGS_TO_ALL_ENQUEUED_CALLS) {
      this.#log.warn(
        `Rejecting tx ${await Tx.getHash(
          tx,
        )} because the total length of args to public enqueued calls is greater than ${MAX_ARGS_TO_ALL_ENQUEUED_CALLS}`,
      );
      return { result: 'invalid', reason: ['Too many args to enqueued calls'] };
    }
    const invalidExecutionRequestIndex = (
      await Promise.all(
        tx.enqueuedPublicFunctionCalls.map(
          async (execRequest, i) => !(await execRequest.isForCallRequest(callRequests[i])),
        ),
      )
    ).findIndex(Boolean);
    if (invalidExecutionRequestIndex !== -1) {
      this.#log.warn(
        `Rejecting tx ${await Tx.getHash(
          tx,
        )} because of incorrect execution requests for public call at index ${invalidExecutionRequestIndex}.`,
      );
      return { result: 'invalid', reason: ['Incorrect execution request for public call'] };
    }

    const teardownCallRequest = tx.data.getTeardownPublicCallRequest();
    const isInvalidTeardownExecutionRequest =
      (!teardownCallRequest && !tx.publicTeardownFunctionCall.isEmpty()) ||
      (teardownCallRequest && !(await tx.publicTeardownFunctionCall.isForCallRequest(teardownCallRequest)));
    if (isInvalidTeardownExecutionRequest) {
      this.#log.warn(`Rejecting tx ${await Tx.getHash(tx)} because of incorrect teardown execution requests.`);
      return { result: 'invalid', reason: ['Incorrect teardown execution request'] };
    }

    return { result: 'valid' };
  }

  // TODO: Check logs.
}
