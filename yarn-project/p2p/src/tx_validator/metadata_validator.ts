import { type AnyTx, Tx, type TxValidator } from '@aztec/circuit-types';
import { type Fr } from '@aztec/circuits.js';
import { createLogger } from '@aztec/foundation/log';

export class MetadataTxValidator<T extends AnyTx> implements TxValidator<T> {
  #log = createLogger('p2p:tx_validator:tx_metadata');

  constructor(private chainId: Fr, private blockNumber: Fr) {}

  validateTxs(txs: T[]): Promise<[validTxs: T[], invalidTxs: T[]]> {
    const validTxs: T[] = [];
    const invalidTxs: T[] = [];
    for (const tx of txs) {
      if (!this.#hasCorrectChainId(tx)) {
        invalidTxs.push(tx);
        continue;
      }

      if (!this.#isValidForBlockNumber(tx)) {
        invalidTxs.push(tx);
        continue;
      }

      validTxs.push(tx);
    }

    return Promise.resolve([validTxs, invalidTxs]);
  }

  validateTx(tx: T): Promise<boolean> {
    return Promise.resolve(this.#hasCorrectChainId(tx) && this.#isValidForBlockNumber(tx));
  }

  #hasCorrectChainId(tx: T): boolean {
    if (!tx.data.constants.txContext.chainId.equals(this.chainId)) {
      this.#log.warn(
        `Rejecting tx ${Tx.getHash(
          tx,
        )} because of incorrect chain ${tx.data.constants.txContext.chainId.toNumber()} != ${this.chainId.toNumber()}`,
      );
      return false;
    } else {
      return true;
    }
  }

  #isValidForBlockNumber(tx: T): boolean {
    const maxBlockNumber = tx.data.rollupValidationRequests.maxBlockNumber;

    if (maxBlockNumber.isSome && maxBlockNumber.value < this.blockNumber) {
      this.#log.warn(
        `Rejecting tx ${Tx.getHash(tx)} for low max block number. Tx max block number: ${
          maxBlockNumber.value
        }, current block number: ${this.blockNumber}.`,
      );
      return false;
    } else {
      return true;
    }
  }
}
