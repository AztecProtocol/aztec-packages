import { MAX_FR_CALLDATA_TO_ALL_ENQUEUED_CALLS } from '@aztec/constants';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { ContractClassPublishedEvent } from '@aztec/protocol-contracts/class-registry';
import { computeContractClassId } from '@aztec/stdlib/contract';
import { computeCalldataHash } from '@aztec/stdlib/hash';
import {
  TX_ERROR_CALLDATA_COUNT_MISMATCH,
  TX_ERROR_CALLDATA_COUNT_TOO_LARGE,
  TX_ERROR_CONTRACT_CLASS_LOGS,
  TX_ERROR_CONTRACT_CLASS_LOG_COUNT,
  TX_ERROR_CONTRACT_CLASS_LOG_LENGTH,
  TX_ERROR_CONTRACT_CLASS_LOG_SORTING,
  TX_ERROR_INCORRECT_CALLDATA,
  TX_ERROR_INCORRECT_CONTRACT_CLASS_ID,
  TX_ERROR_INCORRECT_HASH,
  TX_ERROR_MALFORMED_CONTRACT_CLASS_LOG,
  Tx,
  type TxValidationResult,
  type TxValidator,
} from '@aztec/stdlib/tx';

export class DataTxValidator implements TxValidator<Tx> {
  public readonly identifier: symbol = Symbol('DataTxValidator');

  #log: Logger;

  constructor(bindings?: LoggerBindings) {
    this.#log = createLogger('p2p:tx_validator:tx_data', bindings);
  }

  async validateTx(tx: Tx): Promise<TxValidationResult> {
    const reason =
      (await this.#hasCorrectHash(tx)) ??
      (await this.#hasCorrectCalldata(tx)) ??
      (await this.#hasCorrectContractClassLogs(tx)) ??
      (await this.#hasCorrectContractClassIds(tx));
    return reason ? { result: 'invalid', reason: [reason] } : { result: 'valid' };
  }

  async #hasCorrectHash(tx: Tx): Promise<string | undefined> {
    const expected = await Tx.computeTxHash(tx);
    if (!tx.getTxHash().equals(expected)) {
      const reason = TX_ERROR_INCORRECT_HASH;
      this.#log.verbose(
        `Rejecting tx ${tx.getTxHash().toString()}. Reason: ${reason}. Expected hash ${expected.toString()}. Got ${tx
          .getTxHash()
          .toString()}.`,
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
        `Rejecting tx ${tx
          .getTxHash()
          .toString()}. Reason: ${reason}. Expected no greater than ${MAX_FR_CALLDATA_TO_ALL_ENQUEUED_CALLS} fields. Got ${tx.getTotalPublicCalldataCount()}.`,
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
            `Rejecting tx ${tx
              .getTxHash()
              .toString()} because of mismatched contract class logs indices. Expected ${i} from the kernel's log hashes. Got ${matchingLogIndex} in the tx.`,
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
          `Rejecting tx ${tx
            .getTxHash()
            .toString()} because of incorrect contract class log length. Expected the length to be at least ${expectedMinLength}. Got ${
            logHash.logHash.length
          }.`,
        );
        return TX_ERROR_CONTRACT_CLASS_LOG_LENGTH;
      }
    }

    return undefined;
  }

  async #hasCorrectContractClassIds(tx: Tx): Promise<string | undefined> {
    const contractClassLogs = tx.getContractClassLogs();
    for (const log of contractClassLogs) {
      if (!ContractClassPublishedEvent.isContractClassPublishedEvent(log)) {
        continue;
      }

      let event;
      try {
        event = ContractClassPublishedEvent.fromLog(log);
      } catch (e) {
        this.#log.warn(`Rejecting tx ${tx.getTxHash()}: failed to parse contract class event: ${e}`);
        return TX_ERROR_MALFORMED_CONTRACT_CLASS_LOG;
      }

      try {
        const { publicBytecodeCommitment } = await event.toContractClassPublicWithBytecodeCommitment();
        const computedClassId = await computeContractClassId({
          artifactHash: event.artifactHash,
          privateFunctionsRoot: event.privateFunctionsRoot,
          publicBytecodeCommitment,
        });
        if (!computedClassId.equals(event.contractClassId)) {
          this.#log.warn(
            `Rejecting tx ${tx.getTxHash()}: contract class id mismatch. Claimed ${event.contractClassId}, computed ${computedClassId}`,
          );
          return TX_ERROR_INCORRECT_CONTRACT_CLASS_ID;
        }
      } catch (e) {
        this.#log.warn(`Rejecting tx ${tx.getTxHash()}: failed to compute contract class id: ${e}`);
        return TX_ERROR_MALFORMED_CONTRACT_CLASS_LOG;
      }
    }
    return undefined;
  }
}
