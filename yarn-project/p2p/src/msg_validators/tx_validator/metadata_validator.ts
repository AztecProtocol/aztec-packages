import type { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import {
  type AnyTx,
  TX_ERROR_INCORRECT_CHAIN_ID,
  TX_ERROR_INCORRECT_ROLLUP_VERSION,
  TX_ERROR_INVALID_MAX_BLOCK_NUMBER,
  Tx,
  type TxValidationResult,
  type TxValidator,
} from '@aztec/stdlib/tx';

export class MetadataTxValidator<T extends AnyTx> implements TxValidator<T> {
  #log = createLogger('p2p:tx_validator:tx_metadata');

  constructor(private chainId: Fr, private rollupVersion: Fr, private blockNumber: Fr) {}

  async validateTx(tx: T): Promise<TxValidationResult> {
    const errors = [];
    if (!(await this.#hasCorrectChainId(tx))) {
      errors.push(TX_ERROR_INCORRECT_CHAIN_ID);
    }
    if (!(await this.#hasCorrectRollupVersion(tx))) {
      errors.push(TX_ERROR_INCORRECT_ROLLUP_VERSION);
    }
    if (!(await this.#isValidForBlockNumber(tx))) {
      errors.push(TX_ERROR_INVALID_MAX_BLOCK_NUMBER);
    }
    return errors.length > 0 ? { result: 'invalid', reason: errors } : { result: 'valid' };
  }

  async #hasCorrectChainId(tx: T): Promise<boolean> {
    if (!tx.data.constants.txContext.chainId.equals(this.chainId)) {
      this.#log.warn(
        `Rejecting tx ${await Tx.getHash(
          tx,
        )} because of incorrect chain ${tx.data.constants.txContext.chainId.toNumber()} != ${this.chainId.toNumber()}`,
      );
      return false;
    } else {
      return true;
    }
  }

  async #isValidForBlockNumber(tx: T): Promise<boolean> {
    const maxBlockNumber = tx.data.rollupValidationRequests.maxBlockNumber;

    if (maxBlockNumber.isSome && maxBlockNumber.value < this.blockNumber) {
      this.#log.warn(
        `Rejecting tx ${await Tx.getHash(tx)} for low max block number. Tx max block number: ${
          maxBlockNumber.value
        }, current block number: ${this.blockNumber}.`,
      );
      return false;
    } else {
      return true;
    }
  }

  async #hasCorrectRollupVersion(tx: T): Promise<boolean> {
    if (!tx.data.constants.txContext.version.equals(this.rollupVersion)) {
      this.#log.warn(
        `Rejecting tx ${await Tx.getHash(
          tx,
        )} because of incorrect rollup version ${tx.data.constants.txContext.version.toNumber()} != ${this.rollupVersion.toNumber()}`,
      );
      return false;
    } else {
      return true;
    }
  }
}
