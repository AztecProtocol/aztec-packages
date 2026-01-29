import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import type { BlockHash } from '@aztec/stdlib/block';
import { type AnyTx, TX_ERROR_BLOCK_HEADER, type TxValidationResult, type TxValidator } from '@aztec/stdlib/tx';

export interface ArchiveSource {
  getArchiveIndices: (archives: BlockHash[]) => Promise<(bigint | undefined)[]>;
}

export class BlockHeaderTxValidator<T extends AnyTx> implements TxValidator<T> {
  #log: Logger;
  #archiveSource: ArchiveSource;

  constructor(archiveSource: ArchiveSource, bindings?: LoggerBindings) {
    this.#archiveSource = archiveSource;
    this.#log = createLogger('p2p:tx_validator:tx_block_header', bindings);
  }

  async validateTx(tx: T): Promise<TxValidationResult> {
    const [index] = await this.#archiveSource.getArchiveIndices([await tx.data.constants.anchorBlockHeader.hash()]);
    if (index === undefined) {
      this.#log.verbose(`Rejecting tx ${'txHash' in tx ? tx.txHash : tx.hash} for referencing an unknown block header`);
      return { result: 'invalid', reason: [TX_ERROR_BLOCK_HEADER] };
    }
    return { result: 'valid' };
  }
}
