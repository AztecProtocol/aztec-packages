import { MAX_FR_CALLDATA_TO_ALL_ENQUEUED_CALLS } from '@aztec/constants';
import { createLogger } from '@aztec/foundation/log';
import { computeCalldataHash } from '@aztec/stdlib/hash';
import {
  TX_ERROR_CALLDATA_COUNT_MISMATCH,
  TX_ERROR_CALLDATA_COUNT_TOO_LARGE,
  TX_ERROR_CONTRACT_CLASS_LOGS,
  TX_ERROR_CONTRACT_CLASS_LOG_COUNT,
  TX_ERROR_CONTRACT_CLASS_LOG_LENGTH,
  TX_ERROR_CONTRACT_CLASS_LOG_SORTING,
  TX_ERROR_INCORRECT_CALLDATA,
  Tx,
  type TxValidationResult,
  type TxValidator,
} from '@aztec/stdlib/tx';

export class DataTxValidator implements TxValidator<Tx> {
  #log = createLogger('p2p:tx_validator:tx_data');

  async validateTx(tx: Tx): Promise<TxValidationResult> {
    const execRequestRes = this.#hasCorrectCalldata(tx);
    // Note: If we ever skip txs here, must change this return statement to account for them.
    return (await execRequestRes).result === 'invalid' ? execRequestRes : this.#hasCorrectContractClassLogs(tx);
  }

  async #hasCorrectCalldata(tx: Tx): Promise<TxValidationResult> {
    if (tx.publicFunctionCalldata.length !== tx.numberOfPublicCalls()) {
      const reason = TX_ERROR_CALLDATA_COUNT_MISMATCH;
      this.#log.warn(
        `Rejecting tx ${await Tx.getHash(tx)}. Reason: ${reason}. Expected ${tx.numberOfPublicCalls()}. Got ${
          tx.publicFunctionCalldata.length
        }.`,
      );
      return { result: 'invalid', reason: [reason] };
    }

    if (tx.getTotalPublicCalldataCount() > MAX_FR_CALLDATA_TO_ALL_ENQUEUED_CALLS) {
      const reason = TX_ERROR_CALLDATA_COUNT_TOO_LARGE;
      this.#log.warn(
        `Rejecting tx ${await Tx.getHash(
          tx,
        )}. Reason: ${reason}. Expected no greater than ${MAX_FR_CALLDATA_TO_ALL_ENQUEUED_CALLS} fields. Got ${tx.getTotalPublicCalldataCount()}.`,
      );
      return { result: 'invalid', reason: [reason] };
    }

    const callRequests = tx.getPublicCallRequestsWithCalldata();
    for (let i = 0; i < callRequests.length; i++) {
      const { request, calldata } = callRequests[i];
      const hash = await computeCalldataHash(calldata);
      if (!hash.equals(request.calldataHash)) {
        const reason = TX_ERROR_INCORRECT_CALLDATA;
        this.#log.warn(`Rejecting tx ${await Tx.getHash(tx)}. Reason: ${reason}. Call request index: ${i}.`);
        return { result: 'invalid', reason: [reason] };
      }
    }

    return { result: 'valid' };
  }

  async #hasCorrectContractClassLogs(tx: Tx): Promise<TxValidationResult> {
    const contractClassLogsHashes = tx.data.getNonEmptyContractClassLogsHashes();
    const hashedContractClasslogs = await Promise.all(tx.contractClassLogs.map(l => l.hash()));
    if (contractClassLogsHashes.length !== hashedContractClasslogs.length) {
      this.#log.warn(
        `Rejecting tx ${await Tx.getHash(tx)} because of mismatched number of contract class logs. Expected ${
          contractClassLogsHashes.length
        }. Got ${hashedContractClasslogs.length}.`,
      );
      return { result: 'invalid', reason: [TX_ERROR_CONTRACT_CLASS_LOG_COUNT] };
    }
    for (const [i, logHash] of contractClassLogsHashes.entries()) {
      const hashedLog = hashedContractClasslogs[i];
      if (!logHash.value.equals(hashedLog)) {
        if (hashedContractClasslogs.some(l => logHash.value.equals(l))) {
          const matchingLogIndex = hashedContractClasslogs.findIndex(l => logHash.value.equals(l));
          this.#log.warn(
            `Rejecting tx ${await Tx.getHash(
              tx,
            )} because of mismatched contract class logs indices. Expected ${i} from the kernel's log hashes. Got ${matchingLogIndex} in the tx.`,
          );
          return { result: 'invalid', reason: [TX_ERROR_CONTRACT_CLASS_LOG_SORTING] };
        } else {
          this.#log.warn(
            `Rejecting tx ${await Tx.getHash(tx)} because of mismatched contract class logs. Expected hash ${
              logHash.value
            } from the kernels. Got ${hashedLog} in the tx.`,
          );
          return { result: 'invalid', reason: [TX_ERROR_CONTRACT_CLASS_LOGS] };
        }
      }
      if (logHash.logHash.length !== tx.contractClassLogs[i].getEmittedLength()) {
        this.#log.warn(
          `Rejecting tx ${await Tx.getHash(tx)} because of mismatched contract class logs length. Expected ${
            logHash.logHash.length
          } from the kernel's log hashes. Got ${tx.contractClassLogs[i].getEmittedLength()} in the tx.`,
        );
        return { result: 'invalid', reason: [TX_ERROR_CONTRACT_CLASS_LOG_LENGTH] };
      }
    }
    return { result: 'valid' };
  }
}
