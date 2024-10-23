import {
  EncryptedL2BlockL2Logs,
  EncryptedL2NoteLog,
  EncryptedNoteL2BlockL2Logs,
  ExtendedUnencryptedL2Log,
  type FromLogType,
  type GetUnencryptedLogsResponse,
  type L2Block,
  type L2BlockL2Logs,
  type LogFilter,
  LogId,
  LogType,
  UnencryptedL2BlockL2Logs,
  type UnencryptedL2Log,
} from '@aztec/circuit-types';
import { Fr } from '@aztec/circuits.js';
import { INITIAL_L2_BLOCK_NUM } from '@aztec/circuits.js/constants';
import { createDebugLogger } from '@aztec/foundation/log';
import { type AztecKVStore, type AztecMap, type AztecMultiMap } from '@aztec/kv-store';

import { type BlockStore } from './block_store.js';

/**
 * A store for logs
 */
export class LogStore {
  #noteEncryptedLogsByBlock: AztecMap<number, Buffer>;
  #noteEncryptedLogsByHash: AztecMap<string, Buffer>;
  #noteEncryptedLogHashesByTag: AztecMultiMap<string, string>;
  #noteEncryptedLogTagsByBlock: AztecMultiMap<number, string>;
  #encryptedLogsByBlock: AztecMap<number, Buffer>;
  #unencryptedLogsByBlock: AztecMap<number, Buffer>;
  #logsMaxPageSize: number;
  #log = createDebugLogger('aztec:archiver:log_store');

  constructor(private db: AztecKVStore, private blockStore: BlockStore, logsMaxPageSize: number = 1000) {
    this.#noteEncryptedLogsByBlock = db.openMap('archiver_note_encrypted_logs');
    this.#noteEncryptedLogsByHash = db.openMap('archiver_note_encrypted_logs_by_hash');
    this.#noteEncryptedLogHashesByTag = db.openMultiMap('archiver_tagged_note_encrypted_logs');
    this.#noteEncryptedLogTagsByBlock = db.openMultiMap('archiver_note_encrypted_log_tags_by_block');
    this.#encryptedLogsByBlock = db.openMap('archiver_encrypted_logs');
    this.#unencryptedLogsByBlock = db.openMap('archiver_unencrypted_logs');

    this.#logsMaxPageSize = logsMaxPageSize;
  }

  /**
   * Append new logs to the store's list.
   * @param blocks - The blocks for which to add the logs.
   * @returns True if the operation is successful.
   */
  addLogs(blocks: L2Block[]): Promise<boolean> {
    return this.db.transaction(() => {
      blocks.forEach(block => {
        void this.#noteEncryptedLogsByBlock.set(block.number, block.body.noteEncryptedLogs.toBuffer());
        block.body.noteEncryptedLogs.txLogs.forEach(txLogs => {
          const noteLogs = txLogs.unrollLogs();
          noteLogs.forEach(noteLog => {
            const tag = new Fr(noteLog.data.subarray(0, 32));
            const hexHash = noteLog.hash().toString('hex');
            // AztecMultiMap doesn't handle storing buffers well. Using the body 'ordered-binary' encoding returns an error
            // when trying to decode buffers (The number <> cannot be converted to a BigInt because it is not an integer)
            // This unfortunately leads to some duplication, but using the hash of the note log should be fine
            // even if we had duplicated tags.
            void this.#noteEncryptedLogHashesByTag.set(tag.toString(), hexHash);
            void this.#noteEncryptedLogsByHash.set(hexHash, noteLog.toBuffer());
            void this.#noteEncryptedLogTagsByBlock.set(block.number, tag.toString());
          });
        });
        void this.#encryptedLogsByBlock.set(block.number, block.body.encryptedLogs.toBuffer());
        void this.#unencryptedLogsByBlock.set(block.number, block.body.unencryptedLogs.toBuffer());
      });

      return true;
    });
  }

  async deleteLogs(blocks: L2Block[]): Promise<boolean> {
    const noteTagsToDelete = await this.db.transaction(() => {
      return blocks.flatMap(block => Array.from(this.#noteEncryptedLogTagsByBlock.getValues(block.number)));
    });
    const noteLogHashesToDelete = await this.db.transaction(() => {
      return noteTagsToDelete.flatMap(tag => Array.from(this.#noteEncryptedLogHashesByTag.getValues(tag)));
    });
    return this.db.transaction(() => {
      blocks.forEach(block => {
        void this.#noteEncryptedLogsByBlock.delete(block.number);
        void this.#encryptedLogsByBlock.delete(block.number);
        void this.#unencryptedLogsByBlock.delete(block.number);
        void this.#noteEncryptedLogTagsByBlock.delete(block.number);
      });

      noteTagsToDelete.forEach(tag => {
        void this.#noteEncryptedLogHashesByTag.delete(tag.toString());
      });

      noteLogHashesToDelete.forEach(hash => {
        void this.#noteEncryptedLogsByHash.delete(hash);
      });

      return true;
    });
  }

  /**
   * Gets up to `limit` amount of logs starting from `from`.
   * @param start - Number of the L2 block to which corresponds the first logs to be returned.
   * @param limit - The number of logs to return.
   * @param logType - Specifies whether to return encrypted or unencrypted logs.
   * @returns The requested logs.
   */
  *getLogs<TLogType extends LogType>(
    start: number,
    limit: number,
    logType: TLogType,
  ): IterableIterator<L2BlockL2Logs<FromLogType<TLogType>>> {
    const logMap = (() => {
      switch (logType) {
        case LogType.ENCRYPTED:
          return this.#encryptedLogsByBlock;
        case LogType.NOTEENCRYPTED:
          return this.#noteEncryptedLogsByBlock;
        case LogType.UNENCRYPTED:
        default:
          return this.#unencryptedLogsByBlock;
      }
    })();
    const logTypeMap = (() => {
      switch (logType) {
        case LogType.ENCRYPTED:
          return EncryptedL2BlockL2Logs;
        case LogType.NOTEENCRYPTED:
          return EncryptedNoteL2BlockL2Logs;
        case LogType.UNENCRYPTED:
        default:
          return UnencryptedL2BlockL2Logs;
      }
    })();
    const L2BlockL2Logs = logTypeMap;
    for (const buffer of logMap.values({ start, limit })) {
      yield L2BlockL2Logs.fromBuffer(buffer) as L2BlockL2Logs<FromLogType<TLogType>>;
    }
  }

  getLogsByTags(tags: Fr[]): Promise<EncryptedL2NoteLog[][]> {
    return this.db.transaction(() => {
      return tags.map(tag => {
        const logHashes = Array.from(this.#noteEncryptedLogHashesByTag.getValues(tag.toString()));
        return (
          logHashes
            .map(hash => this.#noteEncryptedLogsByHash.get(hash))
            // filter out undefined values, since we should never store the hashes of non-existing logs (the addLogs transaction ensures this)
            .filter(noteLogBuffer => noteLogBuffer)
            .map(noteLogBuffer => EncryptedL2NoteLog.fromBuffer(noteLogBuffer!))
        );
      });
    });
  }

  /**
   * Gets unencrypted logs based on the provided filter.
   * @param filter - The filter to apply to the logs.
   * @returns The requested logs.
   */
  getUnencryptedLogs(filter: LogFilter): GetUnencryptedLogsResponse {
    if (filter.afterLog) {
      return this.#filterUnencryptedLogsBetweenBlocks(filter);
    } else if (filter.txHash) {
      return this.#filterUnencryptedLogsOfTx(filter);
    } else {
      return this.#filterUnencryptedLogsBetweenBlocks(filter);
    }
  }

  #filterUnencryptedLogsOfTx(filter: LogFilter): GetUnencryptedLogsResponse {
    if (!filter.txHash) {
      throw new Error('Missing txHash');
    }

    const [blockNumber, txIndex] = this.blockStore.getTxLocation(filter.txHash) ?? [];
    if (typeof blockNumber !== 'number' || typeof txIndex !== 'number') {
      return { logs: [], maxLogsHit: false };
    }

    const unencryptedLogsInBlock = this.#getBlockLogs(blockNumber, LogType.UNENCRYPTED);
    const txLogs = unencryptedLogsInBlock.txLogs[txIndex].unrollLogs();

    const logs: ExtendedUnencryptedL2Log[] = [];
    const maxLogsHit = this.#accumulateLogs(logs, blockNumber, txIndex, txLogs, filter);

    return { logs, maxLogsHit };
  }

  #filterUnencryptedLogsBetweenBlocks(filter: LogFilter): GetUnencryptedLogsResponse {
    const start =
      filter.afterLog?.blockNumber ?? Math.max(filter.fromBlock ?? INITIAL_L2_BLOCK_NUM, INITIAL_L2_BLOCK_NUM);
    const end = filter.toBlock;

    if (typeof end === 'number' && end < start) {
      return {
        logs: [],
        maxLogsHit: true,
      };
    }

    const logs: ExtendedUnencryptedL2Log[] = [];

    let maxLogsHit = false;
    loopOverBlocks: for (const [blockNumber, logBuffer] of this.#unencryptedLogsByBlock.entries({ start, end })) {
      const unencryptedLogsInBlock = UnencryptedL2BlockL2Logs.fromBuffer(logBuffer);
      for (let txIndex = filter.afterLog?.txIndex ?? 0; txIndex < unencryptedLogsInBlock.txLogs.length; txIndex++) {
        const txLogs = unencryptedLogsInBlock.txLogs[txIndex].unrollLogs();
        maxLogsHit = this.#accumulateLogs(logs, blockNumber, txIndex, txLogs, filter);
        if (maxLogsHit) {
          this.#log.debug(`Max logs hit at block ${blockNumber}`);
          break loopOverBlocks;
        }
      }
    }

    return { logs, maxLogsHit };
  }

  #accumulateLogs(
    results: ExtendedUnencryptedL2Log[],
    blockNumber: number,
    txIndex: number,
    txLogs: UnencryptedL2Log[],
    filter: LogFilter,
  ): boolean {
    let maxLogsHit = false;
    let logIndex = typeof filter.afterLog?.logIndex === 'number' ? filter.afterLog.logIndex + 1 : 0;
    for (; logIndex < txLogs.length; logIndex++) {
      const log = txLogs[logIndex];
      if (!filter.contractAddress || log.contractAddress.equals(filter.contractAddress)) {
        results.push(new ExtendedUnencryptedL2Log(new LogId(blockNumber, txIndex, logIndex), log));
        if (results.length >= this.#logsMaxPageSize) {
          maxLogsHit = true;
          break;
        }
      }
    }

    return maxLogsHit;
  }

  #getBlockLogs<TLogType extends LogType>(
    blockNumber: number,
    logType: TLogType,
  ): L2BlockL2Logs<FromLogType<TLogType>> {
    const logMap = (() => {
      switch (logType) {
        case LogType.ENCRYPTED:
          return this.#encryptedLogsByBlock;
        case LogType.NOTEENCRYPTED:
          return this.#noteEncryptedLogsByBlock;
        case LogType.UNENCRYPTED:
        default:
          return this.#unencryptedLogsByBlock;
      }
    })();
    const logTypeMap = (() => {
      switch (logType) {
        case LogType.ENCRYPTED:
          return EncryptedL2BlockL2Logs;
        case LogType.NOTEENCRYPTED:
          return EncryptedNoteL2BlockL2Logs;
        case LogType.UNENCRYPTED:
        default:
          return UnencryptedL2BlockL2Logs;
      }
    })();
    const L2BlockL2Logs = logTypeMap;
    const buffer = logMap.get(blockNumber);

    if (!buffer) {
      return new L2BlockL2Logs([]) as L2BlockL2Logs<FromLogType<TLogType>>;
    }

    return L2BlockL2Logs.fromBuffer(buffer) as L2BlockL2Logs<FromLogType<TLogType>>;
  }
}
