import {
  ContractClass2BlockL2Logs,
  ExtendedUnencryptedL2Log,
  type GetUnencryptedLogsResponse,
  type L2Block,
  type LogFilter,
  LogId,
  TxScopedL2Log,
  UnencryptedL2BlockL2Logs,
  type UnencryptedL2Log,
} from '@aztec/circuit-types';
import { Fr, PrivateLog } from '@aztec/circuits.js';
import { INITIAL_L2_BLOCK_NUM, MAX_NOTE_HASHES_PER_TX } from '@aztec/circuits.js/constants';
import { createDebugLogger } from '@aztec/foundation/log';
import { BufferReader } from '@aztec/foundation/serialize';
import { type AztecKVStore, type AztecMap } from '@aztec/kv-store';

import { type BlockStore } from './block_store.js';

/**
 * A store for logs
 */
export class LogStore {
  #logsByTag: AztecMap<string, Buffer[]>;
  #logTagsByBlock: AztecMap<number, string[]>;
  #privateLogsByBlock: AztecMap<number, Buffer>;
  #unencryptedLogsByBlock: AztecMap<number, Buffer>;
  #contractClassLogsByBlock: AztecMap<number, Buffer>;
  #logsMaxPageSize: number;
  #log = createDebugLogger('aztec:archiver:log_store');

  constructor(private db: AztecKVStore, private blockStore: BlockStore, logsMaxPageSize: number = 1000) {
    this.#logsByTag = db.openMap('archiver_tagged_logs_by_tag');
    this.#logTagsByBlock = db.openMap('archiver_log_tags_by_block');
    this.#privateLogsByBlock = db.openMap('archiver_private_logs_by_block');
    this.#unencryptedLogsByBlock = db.openMap('archiver_unencrypted_logs_by_block');
    this.#contractClassLogsByBlock = db.openMap('archiver_contract_class_logs_by_block');

    this.#logsMaxPageSize = logsMaxPageSize;
  }

  #extractTaggedLogsFromPrivate(block: L2Block) {
    const taggedLogs = new Map<string, Buffer[]>();
    const dataStartIndexForBlock =
      block.header.state.partial.noteHashTree.nextAvailableLeafIndex -
      block.body.numberOfTxsIncludingPadded * MAX_NOTE_HASHES_PER_TX;
    block.body.txEffects.forEach((txEffect, txIndex) => {
      const txHash = txEffect.txHash;
      const dataStartIndexForTx = dataStartIndexForBlock + txIndex * MAX_NOTE_HASHES_PER_TX;
      txEffect.privateLogs.forEach(log => {
        const tag = log.fields[0];
        const currentLogs = taggedLogs.get(tag.toString()) ?? [];
        currentLogs.push(
          new TxScopedL2Log(
            txHash,
            dataStartIndexForTx,
            block.number,
            /* isFromPublic */ false,
            log.toBuffer(),
          ).toBuffer(),
        );
        taggedLogs.set(tag.toString(), currentLogs);
      });
    });
    return taggedLogs;
  }

  #extractTaggedLogsFromPublic(block: L2Block) {
    const taggedLogs = new Map<string, Buffer[]>();
    const dataStartIndexForBlock =
      block.header.state.partial.noteHashTree.nextAvailableLeafIndex -
      block.body.numberOfTxsIncludingPadded * MAX_NOTE_HASHES_PER_TX;
    block.body.unencryptedLogs.txLogs.forEach((txLogs, txIndex) => {
      const txHash = block.body.txEffects[txIndex].txHash;
      const dataStartIndexForTx = dataStartIndexForBlock + txIndex * MAX_NOTE_HASHES_PER_TX;
      const logs = txLogs.unrollLogs();
      logs.forEach(log => {
        if (log.data.length < 32 * 33) {
          // TODO remove when #9835 and #9836 are fixed
          this.#log.warn(`Skipping unencrypted log with insufficient data length: ${log.data.length}`);
          return;
        }
        try {
          // TODO remove when #9835 and #9836 are fixed. The partial note logs are emitted as bytes, but encoded as Fields.
          // This means that for every 32 bytes of payload, we only have 1 byte of data.
          // Also, the tag is not stored in the first 32 bytes of the log, (that's the length of public fields now) but in the next 32.
          const correctedBuffer = Buffer.alloc(32);
          const initialOffset = 32;
          for (let i = 0; i < 32; i++) {
            const byte = Fr.fromBuffer(
              log.data.subarray(i * 32 + initialOffset, i * 32 + 32 + initialOffset),
            ).toNumber();
            correctedBuffer.writeUInt8(byte, i);
          }
          const tag = new Fr(correctedBuffer);

          this.#log.debug(`Found tagged unencrypted log with tag ${tag.toString()} in block ${block.number}`);
          const currentLogs = taggedLogs.get(tag.toString()) ?? [];
          currentLogs.push(
            new TxScopedL2Log(txHash, dataStartIndexForTx, block.number, /* isFromPublic */ true, log.data).toBuffer(),
          );
          taggedLogs.set(tag.toString(), currentLogs);
        } catch (err) {
          this.#log.warn(`Failed to add tagged log to store: ${err}`);
        }
      });
    });
    return taggedLogs;
  }

  /**
   * Append new logs to the store's list.
   * @param blocks - The blocks for which to add the logs.
   * @returns True if the operation is successful.
   */
  async addLogs(blocks: L2Block[]): Promise<boolean> {
    const taggedLogsToAdd = blocks
      .flatMap(block => [this.#extractTaggedLogsFromPrivate(block), this.#extractTaggedLogsFromPublic(block)])
      .reduce((acc, val) => {
        for (const [tag, logs] of val.entries()) {
          const currentLogs = acc.get(tag) ?? [];
          acc.set(tag, currentLogs.concat(logs));
        }
        return acc;
      });
    const tagsToUpdate = Array.from(taggedLogsToAdd.keys());
    const currentTaggedLogs = await this.db.transaction(() =>
      tagsToUpdate.map(tag => ({ tag, logBuffers: this.#logsByTag.get(tag) })),
    );
    currentTaggedLogs.forEach(taggedLogBuffer => {
      if (taggedLogBuffer.logBuffers && taggedLogBuffer.logBuffers.length > 0) {
        taggedLogsToAdd.set(
          taggedLogBuffer.tag,
          taggedLogBuffer.logBuffers!.concat(taggedLogsToAdd.get(taggedLogBuffer.tag)!),
        );
      }
    });
    return this.db.transaction(() => {
      blocks.forEach(block => {
        const tagsInBlock = [];
        for (const [tag, logs] of taggedLogsToAdd.entries()) {
          void this.#logsByTag.set(tag, logs);
          tagsInBlock.push(tag);
        }
        void this.#logTagsByBlock.set(block.number, tagsInBlock);

        const privateLogsInBlock = block.body.txEffects
          .map(txEffect => txEffect.privateLogs)
          .flat()
          .map(log => log.toBuffer());
        void this.#privateLogsByBlock.set(block.number, Buffer.concat(privateLogsInBlock));

        void this.#unencryptedLogsByBlock.set(block.number, block.body.unencryptedLogs.toBuffer());
        void this.#contractClassLogsByBlock.set(block.number, block.body.contractClassLogs.toBuffer());
      });

      return true;
    });
  }

  async deleteLogs(blocks: L2Block[]): Promise<boolean> {
    const tagsToDelete = await this.db.transaction(() => {
      return blocks.flatMap(block => this.#logTagsByBlock.get(block.number)?.map(tag => tag.toString()) ?? []);
    });
    return this.db.transaction(() => {
      blocks.forEach(block => {
        void this.#privateLogsByBlock.delete(block.number);
        void this.#unencryptedLogsByBlock.delete(block.number);
        void this.#logTagsByBlock.delete(block.number);
      });

      tagsToDelete.forEach(tag => {
        void this.#logsByTag.delete(tag.toString());
      });

      return true;
    });
  }

  /**
   * Retrieves all private logs from up to `limit` blocks, starting from the block number `start`.
   * @param start - The block number from which to begin retrieving logs.
   * @param limit - The maximum number of blocks to retrieve logs from.
   * @returns An array of private logs from the specified range of blocks.
   */
  getPrivateLogs(start: number, limit: number) {
    const logs = [];
    for (const buffer of this.#privateLogsByBlock.values({ start, limit })) {
      const reader = new BufferReader(buffer);
      while (reader.remainingBytes() > 0) {
        logs.push(reader.readObject(PrivateLog));
      }
    }
    return logs;
  }

  /**
   * Gets all logs that match any of the received tags (i.e. logs with their first field equal to a tag).
   * @param tags - The tags to filter the logs by.
   * @returns For each received tag, an array of matching logs is returned. An empty array implies no logs match
   * that tag.
   */
  getLogsByTags(tags: Fr[]): Promise<TxScopedL2Log[][]> {
    return this.db.transaction(() =>
      tags
        .map(tag => this.#logsByTag.get(tag.toString()))
        .map(noteLogBuffers => noteLogBuffers?.map(noteLogBuffer => TxScopedL2Log.fromBuffer(noteLogBuffer)) ?? []),
    );
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

    const buffer = this.#unencryptedLogsByBlock.get(blockNumber) ?? Buffer.alloc(0);
    const unencryptedLogsInBlock = UnencryptedL2BlockL2Logs.fromBuffer(buffer);

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

  /**
   * Gets contract class logs based on the provided filter.
   * @param filter - The filter to apply to the logs.
   * @returns The requested logs.
   */
  getContractClassLogs(filter: LogFilter): GetUnencryptedLogsResponse {
    if (filter.afterLog) {
      return this.#filterContractClassLogsBetweenBlocks(filter);
    } else if (filter.txHash) {
      return this.#filterContractClassLogsOfTx(filter);
    } else {
      return this.#filterContractClassLogsBetweenBlocks(filter);
    }
  }

  #filterContractClassLogsOfTx(filter: LogFilter): GetUnencryptedLogsResponse {
    if (!filter.txHash) {
      throw new Error('Missing txHash');
    }

    const [blockNumber, txIndex] = this.blockStore.getTxLocation(filter.txHash) ?? [];
    if (typeof blockNumber !== 'number' || typeof txIndex !== 'number') {
      return { logs: [], maxLogsHit: false };
    }
    const contractClassLogsBuffer = this.#contractClassLogsByBlock.get(blockNumber);
    const contractClassLogsInBlock = contractClassLogsBuffer
      ? ContractClass2BlockL2Logs.fromBuffer(contractClassLogsBuffer)
      : new ContractClass2BlockL2Logs([]);
    const txLogs = contractClassLogsInBlock.txLogs[txIndex].unrollLogs();

    const logs: ExtendedUnencryptedL2Log[] = [];
    const maxLogsHit = this.#accumulateLogs(logs, blockNumber, txIndex, txLogs, filter);

    return { logs, maxLogsHit };
  }

  #filterContractClassLogsBetweenBlocks(filter: LogFilter): GetUnencryptedLogsResponse {
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
    loopOverBlocks: for (const [blockNumber, logBuffer] of this.#contractClassLogsByBlock.entries({ start, end })) {
      const contractClassLogsInBlock = ContractClass2BlockL2Logs.fromBuffer(logBuffer);
      for (let txIndex = filter.afterLog?.txIndex ?? 0; txIndex < contractClassLogsInBlock.txLogs.length; txIndex++) {
        const txLogs = contractClassLogsInBlock.txLogs[txIndex].unrollLogs();
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
}
