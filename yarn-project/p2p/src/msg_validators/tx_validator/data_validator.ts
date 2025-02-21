import { Tx, type TxValidationResult, type TxValidator } from '@aztec/circuit-types';
import { createLogger } from '@aztec/foundation/log';

export class DataTxValidator implements TxValidator<Tx> {
  #log = createLogger('p2p:tx_validator:tx_data');

  async validateTx(tx: Tx): Promise<TxValidationResult> {
    const execRequestRes = this.#hasCorrectExecutionRequests(tx);
    // Note: If we ever skip txs here, must change this return statement to account for them.
    return (await execRequestRes).result === 'invalid' ? execRequestRes : this.#hasCorrectContractClassLogs(tx);
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

  async #hasCorrectContractClassLogs(tx: Tx): Promise<TxValidationResult> {
    const contractClassLogsHashes = tx.data.getNonEmptyContractClassLogsHashes();
    const hashedContractClasslogs = await Promise.all(tx.contractClassLogs.map(l => l.hash()));
    if (contractClassLogsHashes.length !== hashedContractClasslogs.length) {
      this.#log.warn(
        `Rejecting tx ${Tx.getHash(tx)} because of mismatched number of contract class logs. Expected ${
          contractClassLogsHashes.length
        }. Got ${hashedContractClasslogs.length}.`,
      );
      return { result: 'invalid', reason: ['Mismatched number of contract class logs'] };
    }
    for (const [i, logHash] of contractClassLogsHashes.entries()) {
      const hashedLog = hashedContractClasslogs[i];
      if (!logHash.value.equals(hashedLog)) {
        if (hashedContractClasslogs.some(l => logHash.value.equals(l))) {
          const matchingLogIndex = hashedContractClasslogs.findIndex(l => logHash.value.equals(l));
          this.#log.warn(
            `Rejecting tx ${Tx.getHash(
              tx,
            )} because of mismatched contract class logs indices. Expected ${i} from the kernel's log hashes. Got ${matchingLogIndex} in the tx.`,
          );
          return { result: 'invalid', reason: ['Incorrectly sorted contract class logs'] };
        } else {
          this.#log.warn(
            `Rejecting tx ${Tx.getHash(tx)} because of mismatched contract class logs. Expected hash ${
              logHash.value
            } from the kernels. Got ${hashedLog} in the tx.`,
          );
          return { result: 'invalid', reason: ['Mismatched contract class logs'] };
        }
      }
      if (logHash.logHash.length !== tx.contractClassLogs[i].getEmittedLength()) {
        this.#log.warn(
          `Rejecting tx ${Tx.getHash(tx)} because of mismatched contract class logs length. Expected ${
            logHash.logHash.length
          } from the kernel's log hashes. Got ${tx.contractClassLogs[i].getEmittedLength()} in the tx.`,
        );
        return { result: 'invalid', reason: ['Mismatched contract class logs length'] };
      }
    }
    return { result: 'valid' };
  }
}
