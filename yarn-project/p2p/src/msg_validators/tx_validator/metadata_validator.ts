import type { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import {
  type AnyTx,
  TX_ERROR_INCORRECT_L1_CHAIN_ID,
  TX_ERROR_INCORRECT_PROTOCOL_CONTRACT_TREE_ROOT,
  TX_ERROR_INCORRECT_ROLLUP_VERSION,
  TX_ERROR_INCORRECT_VK_TREE_ROOT,
  TX_ERROR_INVALID_MAX_BLOCK_NUMBER,
  Tx,
  type TxValidationResult,
  type TxValidator,
} from '@aztec/stdlib/tx';

export class MetadataTxValidator<T extends AnyTx> implements TxValidator<T> {
  #log = createLogger('p2p:tx_validator:tx_metadata');

  constructor(
    private values: {
      l1ChainId: Fr;
      rollupVersion: Fr;
      blockNumber: number;
      vkTreeRoot: Fr;
      protocolContractTreeRoot: Fr;
    },
  ) {}

  async validateTx(tx: T): Promise<TxValidationResult> {
    const errors = [];
    if (!(await this.#hasCorrectL1ChainId(tx))) {
      errors.push(TX_ERROR_INCORRECT_L1_CHAIN_ID);
    }
    if (!(await this.#hasCorrectRollupVersion(tx))) {
      errors.push(TX_ERROR_INCORRECT_ROLLUP_VERSION);
    }
    if (!(await this.#isValidForBlockNumber(tx))) {
      errors.push(TX_ERROR_INVALID_MAX_BLOCK_NUMBER);
    }
    if (!(await this.#hasCorrectVkTreeRoot(tx))) {
      errors.push(TX_ERROR_INCORRECT_VK_TREE_ROOT);
    }
    if (!(await this.#hasCorrectProtocolContractTreeRoot(tx))) {
      errors.push(TX_ERROR_INCORRECT_PROTOCOL_CONTRACT_TREE_ROOT);
    }
    return errors.length > 0 ? { result: 'invalid', reason: errors } : { result: 'valid' };
  }

  async #hasCorrectVkTreeRoot(tx: T): Promise<boolean> {
    // This gets implicitly tested in the proof validator, but we can get a much cheaper check here by looking early at the vk.
    if (!tx.data.constants.vkTreeRoot.equals(this.values.vkTreeRoot)) {
      this.#log.verbose(
        `Rejecting tx ${await Tx.getHash(
          tx,
        )} because of incorrect vk tree root ${tx.data.constants.vkTreeRoot.toString()} != ${this.values.vkTreeRoot.toString()}`,
      );
      return false;
    } else {
      return true;
    }
  }

  async #hasCorrectProtocolContractTreeRoot(tx: T): Promise<boolean> {
    if (!tx.data.constants.protocolContractTreeRoot.equals(this.values.protocolContractTreeRoot)) {
      this.#log.verbose(
        `Rejecting tx ${await Tx.getHash(
          tx,
        )} because of incorrect protocol contract tree root ${tx.data.constants.protocolContractTreeRoot.toString()} != ${this.values.protocolContractTreeRoot.toString()}`,
      );
      return false;
    }
    return true;
  }

  async #hasCorrectL1ChainId(tx: T): Promise<boolean> {
    if (!tx.data.constants.txContext.chainId.equals(this.values.l1ChainId)) {
      this.#log.verbose(
        `Rejecting tx ${await Tx.getHash(
          tx,
        )} because of incorrect L1 chain ${tx.data.constants.txContext.chainId.toNumber()} != ${this.values.l1ChainId.toNumber()}`,
      );
      return false;
    } else {
      return true;
    }
  }

  async #isValidForBlockNumber(tx: T): Promise<boolean> {
    const maxBlockNumber = tx.data.rollupValidationRequests.maxBlockNumber;

    if (maxBlockNumber.isSome && maxBlockNumber.value < this.values.blockNumber) {
      this.#log.verbose(
        `Rejecting tx ${await Tx.getHash(tx)} for low max block number. Tx max block number: ${
          maxBlockNumber.value
        }, current block number: ${this.values.blockNumber}.`,
      );
      return false;
    } else {
      return true;
    }
  }

  async #hasCorrectRollupVersion(tx: T): Promise<boolean> {
    if (!tx.data.constants.txContext.version.equals(this.values.rollupVersion)) {
      this.#log.verbose(
        `Rejecting tx ${await Tx.getHash(
          tx,
        )} because of incorrect rollup version ${tx.data.constants.txContext.version.toNumber()} != ${this.values.rollupVersion.toNumber()}`,
      );
      return false;
    } else {
      return true;
    }
  }
}
