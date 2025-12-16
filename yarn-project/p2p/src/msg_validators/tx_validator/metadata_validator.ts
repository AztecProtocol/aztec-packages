import type { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import {
  type AnyTx,
  TX_ERROR_INCORRECT_L1_CHAIN_ID,
  TX_ERROR_INCORRECT_PROTOCOL_CONTRACTS_HASH,
  TX_ERROR_INCORRECT_ROLLUP_VERSION,
  TX_ERROR_INCORRECT_VK_TREE_ROOT,
  type TxValidationResult,
  type TxValidator,
} from '@aztec/stdlib/tx';

export class MetadataTxValidator<T extends AnyTx> implements TxValidator<T> {
  #log = createLogger('p2p:tx_validator:tx_metadata');

  constructor(
    private values: {
      l1ChainId: Fr;
      rollupVersion: Fr;
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
