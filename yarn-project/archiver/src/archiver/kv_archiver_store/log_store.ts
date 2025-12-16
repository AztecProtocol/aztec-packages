import { INITIAL_L2_BLOCK_NUM, MAX_NOTE_HASHES_PER_TX } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { BufferReader, numToUInt32BE } from '@aztec/foundation/serialize';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import { L2BlockHash, L2BlockNew } from '@aztec/stdlib/block';
import type { GetContractClassLogsResponse, GetPublicLogsResponse } from '@aztec/stdlib/interfaces/client';
import {
  ContractClassLog,
  ExtendedContractClassLog,
  ExtendedPublicLog,
  type LogFilter,
  LogId,
  PublicLog,
  TxScopedL2Log,
} from '@aztec/stdlib/logs';

import type { BlockStore } from './block_store.js';

/**
 * A store for logs
 */
export class LogStore {
  #logsByTag: AztecAsyncMap<string, Buffer[]>;
  #logTagsByBlock: AztecAsyncMap<number, string[]>;
  #publicLogsByBlock: AztecAsyncMap<number, Buffer>;
  #contractClassLogsByBlock: AztecAsyncMap<number, Buffer>;
  #logsMaxPageSize: number;
  #log = createLogger('archiver:log_store');

  constructor(
    private db: AztecAsyncKVStore,
    private blockStore: BlockStore,
    logsMaxPageSize: number = 1000,
  ) {
    this.#logsByTag = db.openMap('archiver_tagged_logs_by_tag');
    this.#logTagsByBlock = db.openMap('archiver_log_tags_by_block');
    this.#publicLogsByBlock = db.openMap('archiver_public_logs_by_block');
    this.#contractClassLogsByBlock = db.openMap('archiver_contract_class_logs_by_block');

    this.#logsMaxPageSize = logsMaxPageSize;
  }

  async #extractTaggedLogs(block: L2BlockNew) {
    const blockHash = L2BlockHash.fromField(await block.hash());
    const taggedLogs = new Map<string, Buffer[]>();
    const dataStartIndexForBlock =
      block.header.state.partial.noteHashTree.nextAvailableLeafIndex -
      block.body.txEffects.length * MAX_NOTE_HASHES_PER_TX;
    block.body.txEffects.forEach((txEffect, txIndex) => {
      const txHash = txEffect.txHash;
      const dataStartIndexForTx = dataStartIndexForBlock + txIndex * MAX_NOTE_HASHES_PER_TX;

      txEffect.privateLogs.forEach((log, logIndex) => {
        const tag = log.fields[0];
        this.#log.debug(`Found private log with tag ${tag.toString()} in block ${block.number}`);

        const currentLogs = taggedLogs.get(tag.toString()) ?? [];
        currentLogs.push(
          new TxScopedL2Log(txHash, dataStartIndexForTx, logIndex, block.number, blockHash, log).toBuffer(),
        );
        taggedLogs.set(tag.toString(), currentLogs);
      });

      txEffect.publicLogs.forEach((log, logIndex) => {
        const tag = log.fields[0];
        this.#log.debug(`Found public log with tag ${tag.toString()} in block ${block.number}`);

        const currentLogs = taggedLogs.get(tag.toString()) ?? [];
        currentLogs.push(
          new TxScopedL2Log(txHash, dataStartIndexForTx, logIndex, block.number, blockHash, log).toBuffer(),
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
  async addLogs(blocks: L2BlockNew[]): Promise<boolean> {
    const taggedLogsInBlocks = await Promise.all(blocks.map(block => this.#extractTaggedLogs(block)));
    const taggedLogsToAdd = taggedLogsInBlocks.reduce((acc, taggedLogs) => {
      for (const [tag, logs] of taggedLogs.entries()) {
        const currentLogs = acc.get(tag) ?? [];
        acc.set(tag, currentLogs.concat(logs));
      }
      return acc;
    }, new Map<string, Buffer[]>());
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
        const blockHash = await block.hash();

        const tagsInBlock = [];
        for (const [tag, logs] of taggedLogsToAdd.entries()) {
          await this.#logsByTag.set(tag, logs);
          tagsInBlock.push(tag);
        }
        await this.#logTagsByBlock.set(block.number, tagsInBlock);

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

        await this.#publicLogsByBlock.set(block.number, this.#packWithBlockHash(blockHash, publicLogsInBlock));
        await this.#contractClassLogsByBlock.set(
          block.number,
          this.#packWithBlockHash(blockHash, contractClassLogsInBlock),
        );
      }

      return true;
    });
  }

  #packWithBlockHash(blockHash: Fr, data: Buffer<ArrayBufferLike>[]): Buffer<ArrayBufferLike> {
    return Buffer.concat([blockHash.toBuffer(), ...data]);
  }

  #unpackBlockHash(reader: BufferReader): L2BlockHash {
    const blockHash = reader.remainingBytes() > 0 ? reader.readObject(Fr) : undefined;

    if (!blockHash) {
      throw new Error('Failed to read block hash from log entry buffer');
    }

    return L2BlockHash.fromField(blockHash);
  }

  deleteLogs(blocks: L2BlockNew[]): Promise<boolean> {
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
            this.#publicLogsByBlock.delete(block.number),
            this.#logTagsByBlock.delete(block.number),
            this.#contractClassLogsByBlock.delete(block.number),
          ]),
        ),
      );

      await Promise.all(tagsToDelete.map(tag => this.#logsByTag.delete(tag.toString())));
      return true;
    });
  }

  /**
   * Gets all logs that match any of the received tags (i.e. logs with their first field equal to a tag).
   * @param tags - The tags to filter the logs by.
   * @returns For each received tag, an array of matching logs is returned. An empty array implies no logs match
   * that tag.
   */
  async getLogsByTags(tags: Fr[], limitPerTag?: number): Promise<TxScopedL2Log[][]> {
    if (limitPerTag !== undefined && limitPerTag <= 0) {
      throw new TypeError('limitPerTag needs to be greater than 0');
    }
    const logs = await Promise.all(tags.map(tag => this.#logsByTag.getAsync(tag.toString())));
    return logs.map(
      logBuffers => logBuffers?.slice(0, limitPerTag).map(logBuffer => TxScopedL2Log.fromBuffer(logBuffer)) ?? [],
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

    const blockHash = this.#unpackBlockHash(reader);

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
    const maxLogsHit = this.#accumulateLogs(logs, blockNumber, blockHash, txIndex, txLogs, filter);

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

      const blockHash = this.#unpackBlockHash(reader);

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
        maxLogsHit = this.#accumulateLogs(logs, blockNumber, blockHash, txIndex, txLogs, filter);
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
    const blockHash = this.#unpackBlockHash(reader);

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
    const maxLogsHit = this.#accumulateLogs(logs, blockNumber, blockHash, txIndex, txLogs, filter);

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
      const blockHash = this.#unpackBlockHash(reader);
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
        maxLogsHit = this.#accumulateLogs(logs, blockNumber, blockHash, txIndex, txLogs, filter);
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
    blockHash: L2BlockHash,
    txIndex: number,
    txLogs: (ContractClassLog | PublicLog)[],
    filter: LogFilter = {},
  ): boolean {
    let maxLogsHit = false;
    let logIndex = typeof filter.afterLog?.logIndex === 'number' ? filter.afterLog.logIndex + 1 : 0;
    for (; logIndex < txLogs.length; logIndex++) {
      const log = txLogs[logIndex];
      if (!filter.contractAddress || log.contractAddress.equals(filter.contractAddress)) {
        if (log instanceof ContractClassLog) {
          results.push(
            new ExtendedContractClassLog(new LogId(BlockNumber(blockNumber), blockHash, txIndex, logIndex), log),
          );
        } else if (log instanceof PublicLog) {
          results.push(new ExtendedPublicLog(new LogId(BlockNumber(blockNumber), blockHash, txIndex, logIndex), log));
        } else {
          throw new Error('Unknown log type');
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
