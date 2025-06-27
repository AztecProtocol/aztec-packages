import type { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import {
  type AnyTx,
  TX_ERROR_INCORRECT_L1_CHAIN_ID,
  TX_ERROR_INCORRECT_PROTOCOL_CONTRACT_TREE_ROOT,
  TX_ERROR_INCORRECT_ROLLUP_VERSION,
  TX_ERROR_INCORRECT_VK_TREE_ROOT,
  TX_ERROR_INVALID_INCLUDE_BY_TIMESTAMP,
  Tx,
  type TxValidationResult,
  type TxValidator,
} from '@aztec/stdlib/tx';
import type { UInt64 } from '@aztec/stdlib/types';

export class MetadataTxValidator<T extends AnyTx> implements TxValidator<T> {
  #log = createLogger('p2p:tx_validator:tx_metadata');

  constructor(
    private values: {
      l1ChainId: Fr;
      rollupVersion: Fr;
      // Timestamp at which we will validate that the tx is not expired. This is typically the timestamp of the block
      // being built.
      timestamp: UInt64;
      // Block number in which the tx is considered to be included.
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
    if (!(await this.#isValidForTimestamp(tx))) {
      errors.push(TX_ERROR_INVALID_INCLUDE_BY_TIMESTAMP);
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

  async #isValidForTimestamp(tx: T): Promise<boolean> {
    const includeByTimestamp = tx.data.rollupValidationRequests.includeByTimestamp;
    // If building block 1, we skip the expiration check. For details on why see the `validate_include_by_timestamp`
    // function in `noir-projects/noir-protocol-circuits/crates/rollup-lib/src/base/components/validation_requests.nr`.
    const buildingBlock1 = this.values.blockNumber === 1;

    if (!buildingBlock1 && includeByTimestamp.isSome && includeByTimestamp.value < this.values.timestamp) {
      if (tx.data.constants.historicalHeader.globalVariables.blockNumber === 0) {
        this.#log.warn(
          `A tx built against a genesis block failed to be included in block 1 which is the only block in which txs built against a genesis block are allowed to be included.`,
        );
      }
      this.#log.verbose(
        `Rejecting tx ${await Tx.getHash(tx)} for low expiration timestamp. Tx expiration timestamp: ${includeByTimestamp.value}, timestamp: ${this.values.timestamp}.`,
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
