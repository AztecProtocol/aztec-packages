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
  TX_ERROR_INCORRECT_HASH,
  Tx,
  type TxValidationResult,
  type TxValidator,
} from '@aztec/stdlib/tx';

export class DataTxValidator implements TxValidator<Tx> {
  #log = createLogger('p2p:tx_validator:tx_data');

  async validateTx(tx: Tx): Promise<TxValidationResult> {
    const reason =
      (await this.#hasCorrectHash(tx)) ??
      (await this.#hasCorrectCalldata(tx)) ??
      (await this.#hasCorrectContractClassLogs(tx));
    return reason ? { result: 'invalid', reason: [reason] } : { result: 'valid' };
  }

  async #hasCorrectHash(tx: Tx): Promise<string | undefined> {
    const expected = await Tx.computeTxHash(tx);
    if (!tx.getTxHash().equals(expected)) {
      const reason = TX_ERROR_INCORRECT_HASH;
      this.#log.verbose(
        `Rejecting tx ${tx.getTxHash().toString()}. Reason: ${reason}. Expected hash ${expected.toString()}. Got ${tx.getTxHash().toString()}.`,
      );
      return reason;
    }
    return undefined;
  }

  async #hasCorrectCalldata(tx: Tx): Promise<string | undefined> {
    if (tx.publicFunctionCalldata.length !== tx.numberOfPublicCalls()) {
      const reason = TX_ERROR_CALLDATA_COUNT_MISMATCH;
      this.#log.verbose(
        `Rejecting tx ${tx.getTxHash().toString()}. Reason: ${reason}. Expected ${tx.numberOfPublicCalls()}. Got ${
          tx.publicFunctionCalldata.length
        }.`,
      );
      return reason;
    }

    if (tx.getTotalPublicCalldataCount() > MAX_FR_CALLDATA_TO_ALL_ENQUEUED_CALLS) {
      const reason = TX_ERROR_CALLDATA_COUNT_TOO_LARGE;
      this.#log.verbose(
        `Rejecting tx ${tx.getTxHash().toString()}. Reason: ${reason}. Expected no greater than ${MAX_FR_CALLDATA_TO_ALL_ENQUEUED_CALLS} fields. Got ${tx.getTotalPublicCalldataCount()}.`,
      );
      return reason;
    }

    const callRequests = tx.getPublicCallRequestsWithCalldata();
    for (let i = 0; i < callRequests.length; i++) {
      const { request, calldata } = callRequests[i];
      const hash = await computeCalldataHash(calldata);
      if (!hash.equals(request.calldataHash)) {
        const reason = TX_ERROR_INCORRECT_CALLDATA;
        this.#log.verbose(`Rejecting tx ${tx.getTxHash().toString()}. Reason: ${reason}. Call request index: ${i}.`);
        return reason;
      }
    }

    return undefined;
  }

  async #hasCorrectContractClassLogs(tx: Tx): Promise<string | undefined> {
    const contractClassLogsHashes = tx.data.getNonEmptyContractClassLogsHashes();
    if (contractClassLogsHashes.length !== tx.contractClassLogFields.length) {
      this.#log.verbose(
        `Rejecting tx ${tx.getTxHash().toString()} because of mismatched number of contract class logs. Expected ${
          contractClassLogsHashes.length
        }. Got ${tx.contractClassLogFields.length}.`,
      );
      return TX_ERROR_CONTRACT_CLASS_LOG_COUNT;
    }

    const expectedHashes = await Promise.all(tx.contractClassLogFields.map(l => l.hash()));
    for (const [i, logHash] of contractClassLogsHashes.entries()) {
      const hash = expectedHashes[i];
      if (!logHash.value.equals(hash)) {
        if (expectedHashes.some(h => logHash.value.equals(h))) {
          const matchingLogIndex = expectedHashes.findIndex(l => logHash.value.equals(l));
          this.#log.verbose(
            `Rejecting tx ${tx.getTxHash().toString()} because of mismatched contract class logs indices. Expected ${i} from the kernel's log hashes. Got ${matchingLogIndex} in the tx.`,
          );
          return TX_ERROR_CONTRACT_CLASS_LOG_SORTING;
        } else {
          this.#log.verbose(
            `Rejecting tx ${tx.getTxHash().toString()} because of mismatched contract class logs. Expected hash ${
              logHash.value
            } from the kernels. Got ${hash} in the tx.`,
          );
          return TX_ERROR_CONTRACT_CLASS_LOGS;
        }
      }

      const expectedMinLength = 1 + tx.contractClassLogFields[i].fields.findLastIndex(f => !f.isZero());
      if (logHash.logHash.length < expectedMinLength) {
        this.#log.verbose(
          `Rejecting tx ${tx.getTxHash().toString()} because of incorrect contract class log length. Expected the length to be at least ${expectedMinLength}. Got ${
            logHash.logHash.length
          }.`,
        );
        return TX_ERROR_CONTRACT_CLASS_LOG_LENGTH;
      }
    }

    return undefined;
  }
}
