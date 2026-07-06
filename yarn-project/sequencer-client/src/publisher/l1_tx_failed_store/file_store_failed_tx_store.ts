import type { FileStore } from '@aztec/file-store';
import { type Logger, createLogger } from '@aztec/foundation/log';

import type { FailedL1Tx, FailedL1TxUri, L1TxFailedStore } from './failed_tx_store.js';

/**
 * L1TxFailedStore implementation using the FileStore abstraction.
 * Supports any backend that FileStore supports (GCS, S3, R2, local filesystem).
 */
export class FileStoreL1TxFailedStore implements L1TxFailedStore {
  private readonly log: Logger;

  constructor(
    private readonly fileStore: FileStore,
    logger?: Logger,
  ) {
    this.log = logger ?? createLogger('sequencer:l1-tx-failed-store');
  }

  public async saveFailedTx(tx: FailedL1Tx): Promise<FailedL1TxUri> {
    const prefix = tx.receipt ? 'tx' : 'data';
    const path = `${tx.failureType}/${prefix}-${tx.id}.json`;
    const json = JSON.stringify(tx, null, 2);

    const uri = await this.fileStore.save(path, Buffer.from(json), {
      metadata: {
        'content-type': 'application/json',
        actions: tx.context.actions.join(','),
        'failure-type': tx.failureType,
      },
    });

    this.log.info(`Saved failed L1 tx to ${uri}`, {
      id: tx.id,
      failureType: tx.failureType,
      actions: tx.context.actions.join(','),
    });

    return uri as FailedL1TxUri;
  }

  public async getFailedTx(uri: FailedL1TxUri): Promise<FailedL1Tx> {
    const data = await this.fileStore.read(uri);
    return JSON.parse(data.toString()) as FailedL1Tx;
  }
}
