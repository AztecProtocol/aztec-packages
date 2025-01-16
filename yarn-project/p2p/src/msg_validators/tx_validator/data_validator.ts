import { Tx, type TxValidationResult, type TxValidator } from '@aztec/circuit-types';
import { createLogger } from '@aztec/foundation/log';

export class DataTxValidator implements TxValidator<Tx> {
  #log = createLogger('p2p:tx_validator:tx_data');

  validateTx(tx: Tx): Promise<TxValidationResult> {
    return Promise.resolve(this.#hasCorrectExecutionRequests(tx));
  }

  #hasCorrectExecutionRequests(tx: Tx): TxValidationResult {
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

    const invalidExecutionRequestIndex = tx.enqueuedPublicFunctionCalls.findIndex(
      (execRequest, i) => !execRequest.isForCallRequest(callRequests[i]),
    );
    if (invalidExecutionRequestIndex !== -1) {
      this.#log.warn(
        `Rejecting tx ${Tx.getHash(
          tx,
        )} because of incorrect execution requests for public call at index ${invalidExecutionRequestIndex}.`,
      );
      return { result: 'invalid', reason: ['Incorrect execution request for public call'] };
    }

    const teardownCallRequest = tx.data.getTeardownPublicCallRequest();
    const isInvalidTeardownExecutionRequest =
      (!teardownCallRequest && !tx.publicTeardownFunctionCall.isEmpty()) ||
      (teardownCallRequest && !tx.publicTeardownFunctionCall.isForCallRequest(teardownCallRequest));
    if (isInvalidTeardownExecutionRequest) {
      this.#log.warn(`Rejecting tx ${Tx.getHash(tx)} because of incorrect teardown execution requests.`);
      return { result: 'invalid', reason: ['Incorrect teardown execution request'] };
    }

    return { result: 'valid' };
  }

  // TODO: Check logs.
}
