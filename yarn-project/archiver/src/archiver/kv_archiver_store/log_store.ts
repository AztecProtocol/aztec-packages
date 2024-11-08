import {
  Body,
  EncryptedL2BlockL2Logs,
  EncryptedNoteL2BlockL2Logs,
  ExtendedUnencryptedL2Log,
  type FromLogType,
  type GetUnencryptedLogsResponse,
  type L2Block,
  type L2BlockL2Logs,
  type LogFilter,
  LogId,
  LogType,
  TxHash,
  TxScopedL2Log,
  UnencryptedL2BlockL2Logs,
  type UnencryptedL2Log,
} from '@aztec/circuit-types';
import { Fr } from '@aztec/circuits.js';
import { INITIAL_L2_BLOCK_NUM, MAX_NOTE_HASHES_PER_TX } from '@aztec/circuits.js/constants';
import { createDebugLogger } from '@aztec/foundation/log';
import { type AztecKVStore, type AztecMap, type AztecMultiMap } from '@aztec/kv-store';

import { type BlockStore } from './block_store.js';

/**
 * A store for logs
 */
export class LogStore {
  #noteEncryptedLogsByBlock: AztecMap<number, Buffer>;
  #logsByHash: AztecMap<string, Buffer>;
  #logHashesByTag: AztecMultiMap<string, string>;
  #logTagsByBlock: AztecMultiMap<number, string>;
  #encryptedLogsByBlock: AztecMap<number, Buffer>;
  #unencryptedLogsByBlock: AztecMap<number, Buffer>;
  #logsMaxPageSize: number;
  #log = createDebugLogger('aztec:archiver:log_store');

  constructor(private db: AztecKVStore, private blockStore: BlockStore, logsMaxPageSize: number = 1000) {
    this.#noteEncryptedLogsByBlock = db.openMap('archiver_note_encrypted_logs_by_block');
    this.#logsByHash = db.openMap('archiver_note_encrypted_logs_by_hash');
    this.#logHashesByTag = db.openMultiMap('archiver_tagged_note_encrypted_log_hashes_by_tag');
    this.#logTagsByBlock = db.openMultiMap('archiver_note_encrypted_log_tags_by_block');
    this.#encryptedLogsByBlock = db.openMap('archiver_encrypted_logs_by_block');
    this.#unencryptedLogsByBlock = db.openMap('archiver_unencrypted_logs_by_block');

    this.#logsMaxPageSize = logsMaxPageSize;
  }

  #storeTaggedLogs(block: L2Block, logType: keyof Pick<Body, 'noteEncryptedLogs' | 'unencryptedLogs'>): void {
    const dataStartIndexForBlock =
      block.header.state.partial.noteHashTree.nextAvailableLeafIndex -
      block.body.numberOfTxsIncludingPadded * MAX_NOTE_HASHES_PER_TX;
    block.body[logType].txLogs.forEach((txLogs, txIndex) => {
      const txHash = block.body.txEffects[txIndex].txHash;
      const dataStartIndexForTx = dataStartIndexForBlock + txIndex * MAX_NOTE_HASHES_PER_TX;
      const logs = txLogs.unrollLogs();
      logs.forEach(log => {
        if (
          (logType == 'noteEncryptedLogs' && log.data.length < 32) ||
          // TODO remove when #9835 and #9836 are fixed
          (logType === 'unencryptedLogs' && log.data.length < 32 * 33)
        ) {
          this.#log.warn(`Skipping log (${logType}) with invalid data length: ${log.data.length}`);
          return;
        }
        try {
          let tag = Fr.ZERO;
          // TODO remove when #9835 and #9836 are fixed. The partial note logs are emitted as bytes, but encoded as Fields.
          // This means that for every 32 bytes of payload, we only have 1 byte of data.
          // Also, the tag is not stored in the first 32 bytes of the log, (that's the length of public fields now) but in the next 32.
          if (logType === 'unencryptedLogs') {
            const correctedBuffer = Buffer.alloc(32);
            const initialOffset = 32;
            for (let i = 0; i < 32; i++) {
              const byte = Fr.fromBuffer(
                log.data.subarray(i * 32 + initialOffset, i * 32 + 32 + initialOffset),
              ).toNumber();
              correctedBuffer.writeUInt8(byte, i);
            }
            tag = new Fr(correctedBuffer);
          } else {
            tag = new Fr(log.data.subarray(0, 32));
          }
          this.#log.verbose(`Storing tagged (${logType}) log with tag ${tag.toString()} in block ${block.number}`);
          const hexHash = log.hash().toString('hex');
          // Ideally we'd store all of the logs for a matching tag in an AztecMultiMap, but this type doesn't
          // handle storing buffers well. The 'ordered-binary' encoding returns an error trying to decode buffers
          // ('the number <> cannot be converted to a BigInt because it is not an integer'). We therefore store
          // instead the hashes of the logs.
          void this.#logHashesByTag.set(tag.toString(), hexHash);
          void this.#logsByHash.set(
            hexHash,
            new TxScopedL2Log(
              txHash,
              dataStartIndexForTx,
              block.number,
              logType === 'unencryptedLogs',
              log.data,
            ).toBuffer(),
          );
          void this.#logTagsByBlock.set(block.number, tag.toString());
        } catch (err) {
          this.#log.warn(`Failed to add tagged log to store: ${err}`);
        }
      });
    });
  }

  /**
   * Append new logs to the store's list.
   * @param blocks - The blocks for which to add the logs.
   * @returns True if the operation is successful.
   */
  addLogs(blocks: L2Block[]): Promise<boolean> {
    return this.db.transaction(() => {
      blocks.forEach(block => {
        void this.#storeTaggedLogs(block, 'noteEncryptedLogs');
        void this.#storeTaggedLogs(block, 'unencryptedLogs');
        void this.#noteEncryptedLogsByBlock.set(block.number, block.body.noteEncryptedLogs.toBuffer());
        void this.#encryptedLogsByBlock.set(block.number, block.body.encryptedLogs.toBuffer());
        void this.#unencryptedLogsByBlock.set(block.number, block.body.unencryptedLogs.toBuffer());
      });

      return true;
    });
  }

  async deleteLogs(blocks: L2Block[]): Promise<boolean> {
    const tagsToDelete = await this.db.transaction(() => {
      return blocks.flatMap(block => Array.from(this.#logTagsByBlock.getValues(block.number)));
    });
    const logHashesToDelete = await this.db.transaction(() => {
      return tagsToDelete.flatMap(tag => Array.from(this.#logHashesByTag.getValues(tag)));
    });
    return this.db.transaction(() => {
      blocks.forEach(block => {
        void this.#noteEncryptedLogsByBlock.delete(block.number);
        void this.#encryptedLogsByBlock.delete(block.number);
        void this.#unencryptedLogsByBlock.delete(block.number);
        void this.#logTagsByBlock.delete(block.number);
      });

      tagsToDelete.forEach(tag => {
        void this.#logHashesByTag.delete(tag.toString());
      });

      logHashesToDelete.forEach(hash => {
        void this.#logsByHash.delete(hash);
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

  /**
   * Gets all logs that match any of the received tags (i.e. logs with their first field equal to a tag).
   * @param tags - The tags to filter the logs by.
   * @returns For each received tag, an array of matching logs is returned. An empty array implies no logs match
   * that tag.
   */
  getLogsByTags(tags: Fr[]): Promise<TxScopedL2Log[][]> {
    return this.db.transaction(() => {
      return tags.map(tag => {
        const logHashes = Array.from(this.#logHashesByTag.getValues(tag.toString()));
        return (
          logHashes
            .map(hash => this.#logsByHash.get(hash))
            // addLogs should ensure that we never have undefined logs, but we filter them out regardless to protect
            // ourselves from database corruption
            .filter(noteLogBuffer => noteLogBuffer != undefined)
            .map(noteLogBuffer => TxScopedL2Log.fromBuffer(noteLogBuffer!))
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
