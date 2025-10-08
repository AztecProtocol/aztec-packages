import type { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import {
  type AnyTx,
  TX_ERROR_INCORRECT_L1_CHAIN_ID,
  TX_ERROR_INCORRECT_PROTOCOL_CONTRACTS_HASH,
  TX_ERROR_INCORRECT_ROLLUP_VERSION,
  TX_ERROR_INCORRECT_VK_TREE_ROOT,
  TX_ERROR_INVALID_INCLUDE_BY_TIMESTAMP,
  type TxValidationResult,
  type TxValidator,
  getTxHash,
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
      protocolContractsHash: Fr;
    },
  ) {}

  validateTx(tx: T): Promise<TxValidationResult> {
    const errors = [];
    if (!this.#hasCorrectL1ChainId(tx)) {
      errors.push(TX_ERROR_INCORRECT_L1_CHAIN_ID);
    }
    if (!this.#hasCorrectRollupVersion(tx)) {
      errors.push(TX_ERROR_INCORRECT_ROLLUP_VERSION);
    }
    if (!this.#isValidForTimestamp(tx)) {
      errors.push(TX_ERROR_INVALID_INCLUDE_BY_TIMESTAMP);
    }
    if (!this.#hasCorrectVkTreeRoot(tx)) {
      errors.push(TX_ERROR_INCORRECT_VK_TREE_ROOT);
    }
    if (!this.#hasCorrectprotocolContractsHash(tx)) {
      errors.push(TX_ERROR_INCORRECT_PROTOCOL_CONTRACTS_HASH);
    }
    return Promise.resolve(errors.length > 0 ? { result: 'invalid', reason: errors } : { result: 'valid' });
  }

  #hasCorrectVkTreeRoot(tx: T): boolean {
    // This gets implicitly tested in the proof validator, but we can get a much cheaper check here by looking early at the vk.
    if (!tx.data.constants.vkTreeRoot.equals(this.values.vkTreeRoot)) {
      this.#log.verbose(
        `Rejecting tx ${'txHash' in tx ? tx.txHash : tx.hash} because of incorrect vk tree root ${tx.data.constants.vkTreeRoot.toString()} != ${this.values.vkTreeRoot.toString()}`,
      );
      return false;
    } else {
      return true;
    }
  }

  #hasCorrectprotocolContractsHash(tx: T): boolean {
    if (!tx.data.constants.protocolContractsHash.equals(this.values.protocolContractsHash)) {
      this.#log.verbose(
        `Rejecting tx ${'txHash' in tx ? tx.txHash : tx.hash} because of incorrect protocol contracts hash ${tx.data.constants.protocolContractsHash.toString()} != ${this.values.protocolContractsHash.toString()}`,
      );
      return false;
    }
    return true;
  }

  #hasCorrectL1ChainId(tx: T): boolean {
    if (!tx.data.constants.txContext.chainId.equals(this.values.l1ChainId)) {
      this.#log.verbose(
        `Rejecting tx ${'txHash' in tx ? tx.txHash : tx.hash} because of incorrect L1 chain ${tx.data.constants.txContext.chainId.toNumber()} != ${this.values.l1ChainId.toNumber()}`,
      );
      return false;
    } else {
      return true;
    }
  }

  #isValidForTimestamp(tx: T): boolean {
    const includeByTimestamp = tx.data.includeByTimestamp;
    // If building block 1, we skip the expiration check. For details on why see the `validate_include_by_timestamp`
    // function in `noir-projects/noir-protocol-circuits/crates/rollup-lib/src/base/components/validation_requests.nr`.
    const buildingBlock1 = this.values.blockNumber === 1;

    if (!buildingBlock1 && includeByTimestamp < this.values.timestamp) {
      if (tx.data.constants.anchorBlockHeader.globalVariables.blockNumber === 0) {
        this.#log.warn(
          `A tx built against a genesis block failed to be included in block 1 which is the only block in which txs built against a genesis block are allowed to be included.`,
        );
      }
      this.#log.verbose(
        `Rejecting tx ${getTxHash(tx)} for low expiration timestamp. Tx expiration timestamp: ${includeByTimestamp}, timestamp: ${
          this.values.timestamp
        }.`,
      );
      return false;
    } else {
      return true;
    }
  }

  #hasCorrectRollupVersion(tx: T): boolean {
    if (!tx.data.constants.txContext.version.equals(this.values.rollupVersion)) {
      this.#log.verbose(
        `Rejecting tx ${'txHash' in tx ? tx.txHash : tx.hash} because of incorrect rollup version ${tx.data.constants.txContext.version.toNumber()} != ${this.values.rollupVersion.toNumber()}`,
      );
      return false;
    } else {
      return true;
    }
  }
}
