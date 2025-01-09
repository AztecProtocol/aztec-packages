import { type AnyTx, Tx, type TxValidationResult, type TxValidator } from '@aztec/circuit-types';
import { type Fr } from '@aztec/circuits.js';
import { createLogger } from '@aztec/foundation/log';

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
    const [index] = await this.#archiveSource.getArchiveIndices([tx.data.constants.historicalHeader.hash()]);
    if (index === undefined) {
      this.#log.warn(`Rejecting tx ${Tx.getHash(tx)} for referencing an unknown block header`);
      return { result: 'invalid', reason: ['Block header not found'] };
    }
    return { result: 'valid' };
  }
}
