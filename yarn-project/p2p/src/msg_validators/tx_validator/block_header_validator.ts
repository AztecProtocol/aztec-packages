import type { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { type AnyTx, TX_ERROR_BLOCK_HEADER, Tx, type TxValidationResult, type TxValidator } from '@aztec/stdlib/tx';

export interface ArchiveSource {
  getArchiveIndices: (archives: Fr[]) => Promise<(bigint | undefined)[]>;
}

export class BlockHeaderTxValidator<T extends AnyTx> implements TxValidator<T> {
  #log = createLogger('p2p:tx_validator:tx_block_header');
  #archiveSource: ArchiveSource;

  constructor(archiveSource: ArchiveSource) {
    this.#archiveSource = archiveSource;
  }

  async validateTx(tx: T): Promise<TxValidationResult> {
    const [index] = await this.#archiveSource.getArchiveIndices([await tx.data.constants.historicalHeader.hash()]);
    if (index === undefined) {
      this.#log.verbose(`Rejecting tx ${await Tx.getHash(tx)} for referencing an unknown block header`);
      return { result: 'invalid', reason: [TX_ERROR_BLOCK_HEADER] };
    }
    return { result: 'valid' };
  }
}
