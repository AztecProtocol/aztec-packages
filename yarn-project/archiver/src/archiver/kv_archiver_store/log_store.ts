import {
  ExtendedContractClassLog,
  ExtendedPublicLog,
  type GetContractClassLogsResponse,
  type GetPublicLogsResponse,
  type L2Block,
  type LogFilter,
  LogId,
  TxScopedL2Log,
} from '@aztec/circuit-types';
import { ContractClassLog, type Fr, PrivateLog, PublicLog } from '@aztec/circuits.js';
import {
  INITIAL_L2_BLOCK_NUM,
  MAX_NOTE_HASHES_PER_TX,
  PUBLIC_LOG_DATA_SIZE_IN_FIELDS,
} from '@aztec/circuits.js/constants';
import { createLogger } from '@aztec/foundation/log';
import { BufferReader, numToUInt32BE } from '@aztec/foundation/serialize';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';

import { type BlockStore } from './block_store.js';

/**
 * A store for logs
 */
export class LogStore {
  #logsByTag: AztecAsyncMap<string, Buffer[]>;
  #logTagsByBlock: AztecAsyncMap<number, string[]>;
  #privateLogsByBlock: AztecAsyncMap<number, Buffer>;
  #publicLogsByBlock: AztecAsyncMap<number, Buffer>;
  #contractClassLogsByBlock: AztecAsyncMap<number, Buffer>;
  #logsMaxPageSize: number;
  #log = createLogger('archiver:log_store');

  constructor(private db: AztecAsyncKVStore, private blockStore: BlockStore, logsMaxPageSize: number = 1000) {
    this.#logsByTag = db.openMap('archiver_tagged_logs_by_tag');
    this.#logTagsByBlock = db.openMap('archiver_log_tags_by_block');
    this.#privateLogsByBlock = db.openMap('archiver_private_logs_by_block');
    this.#publicLogsByBlock = db.openMap('archiver_public_logs_by_block');
    this.#contractClassLogsByBlock = db.openMap('archiver_contract_class_logs_by_block');

    this.#logsMaxPageSize = logsMaxPageSize;
  }

  #extractTaggedLogsFromPrivate(block: L2Block) {
    const taggedLogs = new Map<string, Buffer[]>();
    const dataStartIndexForBlock =
      block.header.state.partial.noteHashTree.nextAvailableLeafIndex -
      block.body.txEffects.length * MAX_NOTE_HASHES_PER_TX;
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
      block.body.txEffects.length * MAX_NOTE_HASHES_PER_TX;
    block.body.txEffects.forEach((txEffect, txIndex) => {
      const txHash = txEffect.txHash;
      const dataStartIndexForTx = dataStartIndexForBlock + txIndex * MAX_NOTE_HASHES_PER_TX;
      txEffect.publicLogs.forEach(log => {
        // Check that each log stores 2 lengths in its first field. If not, it's not a tagged log:
        const firstFieldBuf = log.log[0].toBuffer();
        // See macros/note/mod/ and see how finalization_log[0] is constructed, to understand this monstrosity. (It wasn't me).
        // Search the codebase for "disgusting encoding" to see other hardcoded instances of this encoding, that you might need to change if you ever find yourself here.
        if (!firstFieldBuf.subarray(0, 27).equals(Buffer.alloc(27)) || firstFieldBuf[29] !== 0) {
          // See parseLogFromPublic - the first field of a tagged log is 5 bytes structured:
          // [ publicLen[0], publicLen[1], 0, privateLen[0], privateLen[1]]
          this.#log.warn(`Skipping public log with invalid first field: ${log.log[0]}`);
          return;
        }
        // Check that the length values line up with the log contents
        const publicValuesLength = firstFieldBuf.subarray(-5).readUint16BE();
        const privateValuesLength = firstFieldBuf.subarray(-5).readUint16BE(3);
        // Add 1 for the first field holding lengths
        const totalLogLength = 1 + publicValuesLength + privateValuesLength;
        // Note that zeroes can be valid log values, so we can only assert that we do not go over the given length
        if (totalLogLength > PUBLIC_LOG_DATA_SIZE_IN_FIELDS || log.log.slice(totalLogLength).find(f => !f.isZero())) {
          this.#log.warn(`Skipping invalid tagged public log with first field: ${log.log[0]}`);
          return;
        }

        // The first elt stores lengths as above => tag is in fields[1]
        const tag = log.log[1];

        this.#log.debug(`Found tagged public log with tag ${tag.toString()} in block ${block.number}`);
        const currentLogs = taggedLogs.get(tag.toString()) ?? [];
        currentLogs.push(
          new TxScopedL2Log(
            txHash,
            dataStartIndexForTx,
            block.number,
            /* isFromPublic */ true,
            log.toBuffer(),
          ).toBuffer(),
        );
        taggedLogs.set(tag.toString(), currentLogs);
      });
    });
    return taggedLogs;
  }

  /**
   * Append new logs to the store's list.
   * @param blocks - The blocks for which to add the logs.
   * @returns True if the operation is successful.
   */
  addLogs(blocks: L2Block[]): Promise<boolean> {
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

    return this.db.transactionAsync(async () => {
      const currentTaggedLogs = await Promise.all(
        tagsToUpdate.map(async tag => ({ tag, logBuffers: await this.#logsByTag.getAsync(tag) })),
      );
      currentTaggedLogs.forEach(taggedLogBuffer => {
        if (taggedLogBuffer.logBuffers && taggedLogBuffer.logBuffers.length > 0) {
          taggedLogsToAdd.set(
            taggedLogBuffer.tag,
            taggedLogBuffer.logBuffers!.concat(taggedLogsToAdd.get(taggedLogBuffer.tag)!),
          );
        }
      });
      for (const block of blocks) {
        const tagsInBlock = [];
        for (const [tag, logs] of taggedLogsToAdd.entries()) {
          await this.#logsByTag.set(tag, logs);
          tagsInBlock.push(tag);
        }
        await this.#logTagsByBlock.set(block.number, tagsInBlock);

        const privateLogsInBlock = block.body.txEffects
          .map(txEffect => txEffect.privateLogs)
          .flat()
          .map(log => log.toBuffer());
        await this.#privateLogsByBlock.set(block.number, Buffer.concat(privateLogsInBlock));

        const publicLogsInBlock = block.body.txEffects
          .map((txEffect, txIndex) =>
            [
              numToUInt32BE(txIndex),
              numToUInt32BE(txEffect.publicLogs.length),
              txEffect.publicLogs.map(log => log.toBuffer()),
            ].flat(),
          )
          .flat();

        const contractClassLogsInBlock = block.body.txEffects
          .map((txEffect, txIndex) =>
            [
              numToUInt32BE(txIndex),
              numToUInt32BE(txEffect.contractClassLogs.length),
              txEffect.contractClassLogs.map(log => log.toBuffer()),
            ].flat(),
          )
          .flat();

        await this.#publicLogsByBlock.set(block.number, Buffer.concat(publicLogsInBlock));
        await this.#contractClassLogsByBlock.set(block.number, Buffer.concat(contractClassLogsInBlock));
      }

      return true;
    });
  }

  deleteLogs(blocks: L2Block[]): Promise<boolean> {
    return this.db.transactionAsync(async () => {
      const tagsToDelete = (
        await Promise.all(
          blocks.map(async block => {
            const tags = await this.#logTagsByBlock.getAsync(block.number);
            return tags ?? [];
          }),
        )
      ).flat();

      await Promise.all(
        blocks.map(block =>
          Promise.all([
            this.#privateLogsByBlock.delete(block.number),
            this.#publicLogsByBlock.delete(block.number),
            this.#logTagsByBlock.delete(block.number),
          ]),
        ),
      );

      await Promise.all(tagsToDelete.map(tag => this.#logsByTag.delete(tag.toString())));
      return true;
    });
  }

  /**
   * Retrieves all private logs from up to `limit` blocks, starting from the block number `start`.
   * @param start - The block number from which to begin retrieving logs.
   * @param limit - The maximum number of blocks to retrieve logs from.
   * @returns An array of private logs from the specified range of blocks.
   */
  async getPrivateLogs(start: number, limit: number): Promise<PrivateLog[]> {
    const logs = [];
    for await (const buffer of this.#privateLogsByBlock.valuesAsync({ start, limit })) {
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
  async getLogsByTags(tags: Fr[]): Promise<TxScopedL2Log[][]> {
    const logs = await Promise.all(tags.map(tag => this.#logsByTag.getAsync(tag.toString())));
    return logs.map(
      noteLogBuffers => noteLogBuffers?.map(noteLogBuffer => TxScopedL2Log.fromBuffer(noteLogBuffer)) ?? [],
    );
  }

  /**
   * Gets public logs based on the provided filter.
   * @param filter - The filter to apply to the logs.
   * @returns The requested logs.
   */
  getPublicLogs(filter: LogFilter): Promise<GetPublicLogsResponse> {
    if (filter.afterLog) {
      return this.#filterPublicLogsBetweenBlocks(filter);
    } else if (filter.txHash) {
      return this.#filterPublicLogsOfTx(filter);
    } else {
      return this.#filterPublicLogsBetweenBlocks(filter);
    }
  }

  async #filterPublicLogsOfTx(filter: LogFilter): Promise<GetPublicLogsResponse> {
    if (!filter.txHash) {
      throw new Error('Missing txHash');
    }

    const [blockNumber, txIndex] = (await this.blockStore.getTxLocation(filter.txHash)) ?? [];
    if (typeof blockNumber !== 'number' || typeof txIndex !== 'number') {
      return { logs: [], maxLogsHit: false };
    }

    const buffer = (await this.#publicLogsByBlock.getAsync(blockNumber)) ?? Buffer.alloc(0);
    const publicLogsInBlock: [PublicLog[]] = [[]];
    const reader = new BufferReader(buffer);
    while (reader.remainingBytes() > 0) {
      const indexOfTx = reader.readNumber();
      const numLogsInTx = reader.readNumber();
      publicLogsInBlock[indexOfTx] = [];
      for (let i = 0; i < numLogsInTx; i++) {
        publicLogsInBlock[indexOfTx].push(reader.readObject(PublicLog));
      }
    }

    const txLogs = publicLogsInBlock[txIndex];

    const logs: ExtendedPublicLog[] = [];
    const maxLogsHit = this.#accumulateLogs(logs, blockNumber, txIndex, txLogs, filter);

    return { logs, maxLogsHit };
  }

  async #filterPublicLogsBetweenBlocks(filter: LogFilter): Promise<GetPublicLogsResponse> {
    const start =
      filter.afterLog?.blockNumber ?? Math.max(filter.fromBlock ?? INITIAL_L2_BLOCK_NUM, INITIAL_L2_BLOCK_NUM);
    const end = filter.toBlock;

    if (typeof end === 'number' && end < start) {
      return {
        logs: [],
        maxLogsHit: true,
      };
    }

    const logs: ExtendedPublicLog[] = [];

    let maxLogsHit = false;
    loopOverBlocks: for await (const [blockNumber, logBuffer] of this.#publicLogsByBlock.entriesAsync({ start, end })) {
      const publicLogsInBlock: [PublicLog[]] = [[]];
      const reader = new BufferReader(logBuffer);
      while (reader.remainingBytes() > 0) {
        const indexOfTx = reader.readNumber();
        const numLogsInTx = reader.readNumber();
        publicLogsInBlock[indexOfTx] = [];
        for (let i = 0; i < numLogsInTx; i++) {
          publicLogsInBlock[indexOfTx].push(reader.readObject(PublicLog));
        }
      }
      for (let txIndex = filter.afterLog?.txIndex ?? 0; txIndex < publicLogsInBlock.length; txIndex++) {
        const txLogs = publicLogsInBlock[txIndex];
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
  getContractClassLogs(filter: LogFilter): Promise<GetContractClassLogsResponse> {
    if (filter.afterLog) {
      return this.#filterContractClassLogsBetweenBlocks(filter);
    } else if (filter.txHash) {
      return this.#filterContractClassLogsOfTx(filter);
    } else {
      return this.#filterContractClassLogsBetweenBlocks(filter);
    }
  }

  async #filterContractClassLogsOfTx(filter: LogFilter): Promise<GetContractClassLogsResponse> {
    if (!filter.txHash) {
      throw new Error('Missing txHash');
    }

    const [blockNumber, txIndex] = (await this.blockStore.getTxLocation(filter.txHash)) ?? [];
    if (typeof blockNumber !== 'number' || typeof txIndex !== 'number') {
      return { logs: [], maxLogsHit: false };
    }
    const contractClassLogsBuffer = (await this.#contractClassLogsByBlock.getAsync(blockNumber)) ?? Buffer.alloc(0);
    const contractClassLogsInBlock: [ContractClassLog[]] = [[]];

    const reader = new BufferReader(contractClassLogsBuffer);
    while (reader.remainingBytes() > 0) {
      const indexOfTx = reader.readNumber();
      const numLogsInTx = reader.readNumber();
      contractClassLogsInBlock[indexOfTx] = [];
      for (let i = 0; i < numLogsInTx; i++) {
        contractClassLogsInBlock[indexOfTx].push(reader.readObject(ContractClassLog));
      }
    }

    const txLogs = contractClassLogsInBlock[txIndex];

    const logs: ExtendedContractClassLog[] = [];
    const maxLogsHit = this.#accumulateLogs(logs, blockNumber, txIndex, txLogs, filter);

    return { logs, maxLogsHit };
  }

  async #filterContractClassLogsBetweenBlocks(filter: LogFilter): Promise<GetContractClassLogsResponse> {
    const start =
      filter.afterLog?.blockNumber ?? Math.max(filter.fromBlock ?? INITIAL_L2_BLOCK_NUM, INITIAL_L2_BLOCK_NUM);
    const end = filter.toBlock;

    if (typeof end === 'number' && end < start) {
      return {
        logs: [],
        maxLogsHit: true,
      };
    }

    const logs: ExtendedContractClassLog[] = [];

    let maxLogsHit = false;
    loopOverBlocks: for await (const [blockNumber, logBuffer] of this.#contractClassLogsByBlock.entriesAsync({
      start,
      end,
    })) {
      const contractClassLogsInBlock: [ContractClassLog[]] = [[]];
      const reader = new BufferReader(logBuffer);
      while (reader.remainingBytes() > 0) {
        const indexOfTx = reader.readNumber();
        const numLogsInTx = reader.readNumber();
        contractClassLogsInBlock[indexOfTx] = [];
        for (let i = 0; i < numLogsInTx; i++) {
          contractClassLogsInBlock[indexOfTx].push(reader.readObject(ContractClassLog));
        }
      }
      for (let txIndex = filter.afterLog?.txIndex ?? 0; txIndex < contractClassLogsInBlock.length; txIndex++) {
        const txLogs = contractClassLogsInBlock[txIndex];
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
    results: (ExtendedContractClassLog | ExtendedPublicLog)[],
    blockNumber: number,
    txIndex: number,
    txLogs: (ContractClassLog | PublicLog)[],
    filter: LogFilter,
  ): boolean {
    let maxLogsHit = false;
    let logIndex = typeof filter.afterLog?.logIndex === 'number' ? filter.afterLog.logIndex + 1 : 0;
    for (; logIndex < txLogs.length; logIndex++) {
      const log = txLogs[logIndex];
      // TODO(MW): fix hack for contract class
      if (!filter.contractAddress || (log instanceof PublicLog && log.contractAddress.equals(filter.contractAddress))) {
        if (log instanceof ContractClassLog) {
          results.push(new ExtendedContractClassLog(new LogId(blockNumber, txIndex, logIndex), log));
        } else {
          results.push(new ExtendedPublicLog(new LogId(blockNumber, txIndex, logIndex), log));
        }

        if (results.length >= this.#logsMaxPageSize) {
          maxLogsHit = true;
          break;
        }
      }
    }

    return maxLogsHit;
  }
}
