import { type AnyTx, Tx, type TxValidator } from '@aztec/circuit-types';
import { type Fr } from '@aztec/circuits.js';
import { createLogger } from '@aztec/foundation/log';

export interface ArchiveSource {
  getArchiveIndices: (archives: Fr[]) => Promise<(bigint | undefined)[]>;
}

export class BlockHeaderTxValidator<T extends AnyTx> implements TxValidator<T> {
  #log = createLogger('p2p:tx_validator:tx_block_header');
  #archiveSource: ArchiveSource;
  #archives: { [key: string]: boolean } = {};

  constructor(archiveSource: ArchiveSource, private readonly isValidatingBlock: boolean = true) {
    this.#archiveSource = archiveSource;
  }

  async validateTxs(txs: T[]): Promise<[validTxs: T[], invalidTxs: T[]]> {
    const validTxs: T[] = [];
    const invalidTxs: T[] = [];

    for (const tx of txs) {
      const archive = tx.data.constants.historicalHeader.hash();
      const archiveAsString = archive.toString();
      if (this.#archives[archiveAsString] === undefined) {
        const archiveIndices = await this.#archiveSource.getArchiveIndices([archive]);
        this.#archives[archiveAsString] = archiveIndices[0] !== undefined;
      }
      if (this.#archives[archiveAsString] === true) {
        validTxs.push(tx);
      } else {
        invalidTxs.push(tx);
        this.#log.warn(`Rejecting tx ${Tx.getHash(tx)} for referencing an unknown block header`);
      }
    }

    return [validTxs, invalidTxs];
  }

  async validateTx(tx: T): Promise<boolean> {
    const [validTxs] = await this.validateTxs([tx]);
    return Promise.resolve(validTxs.length === 1);
  }
}
