import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { filterAsync } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { BufferReader, numToUInt32BE } from '@aztec/foundation/serialize';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { L2BlockHash, L2BlockNew } from '@aztec/stdlib/block';
import { MAX_LOGS_PER_TAG } from '@aztec/stdlib/interfaces/api-limit';
import type { GetContractClassLogsResponse, GetPublicLogsResponse } from '@aztec/stdlib/interfaces/client';
import {
  ContractClassLog,
  ExtendedContractClassLog,
  ExtendedPublicLog,
  type LogFilter,
  LogId,
  PublicLog,
  type SiloedTag,
  Tag,
  TxScopedL2Log,
} from '@aztec/stdlib/logs';

import type { BlockStore } from './block_store.js';

/**
 * A store for logs
 */
export class LogStore {
  // `tag` --> private logs
  #privateLogsByTag: AztecAsyncMap<string, Buffer[]>;
  // `{contractAddress}_${tag}` --> public logs
  #publicLogsByContractAndTag: AztecAsyncMap<string, Buffer[]>;
  #privateLogKeysByBlock: AztecAsyncMap<number, string[]>;
  #publicLogKeysByBlock: AztecAsyncMap<number, string[]>;
  #publicLogsByBlock: AztecAsyncMap<number, Buffer>;
  #contractClassLogsByBlock: AztecAsyncMap<number, Buffer>;
  #logsMaxPageSize: number;
  #log = createLogger('archiver:log_store');

  constructor(
    private db: AztecAsyncKVStore,
    private blockStore: BlockStore,
    logsMaxPageSize: number = 1000,
  ) {
    this.#privateLogsByTag = db.openMap('archiver_private_tagged_logs_by_tag');
    this.#publicLogsByContractAndTag = db.openMap('archiver_public_tagged_logs_by_tag');
    this.#privateLogKeysByBlock = db.openMap('archiver_private_log_keys_by_block');
    this.#publicLogKeysByBlock = db.openMap('archiver_public_log_keys_by_block');
    this.#publicLogsByBlock = db.openMap('archiver_public_logs_by_block');
    this.#contractClassLogsByBlock = db.openMap('archiver_contract_class_logs_by_block');

    this.#logsMaxPageSize = logsMaxPageSize;
  }

  /**
   * Extracts tagged logs from a single block, grouping them into private and public maps.
   *
   * @param block - The L2 block to extract logs from.
   * @returns An object containing the private and public tagged logs for the block.
   */
  #extractTaggedLogsFromBlock(block: L2BlockNew) {
    // SiloedTag (as string) -> array of log buffers.
    const privateTaggedLogs = new Map<string, Buffer[]>();
    // "{contractAddress}_{tag}" (as string) -> array of log buffers.
    const publicTaggedLogs = new Map<string, Buffer[]>();

    block.body.txEffects.forEach(txEffect => {
      const txHash = txEffect.txHash;

      txEffect.privateLogs.forEach(log => {
        // Private logs use SiloedTag (already siloed by kernel)
        const tag = log.fields[0];
        this.#log.debug(`Found private log with tag ${tag.toString()} in block ${block.number}`);

        const currentLogs = privateTaggedLogs.get(tag.toString()) ?? [];
        currentLogs.push(
          new TxScopedL2Log(
            txHash,
            block.number,
            block.timestamp,
            log.getEmittedFields(),
            txEffect.noteHashes,
            txEffect.nullifiers[0],
          ).toBuffer(),
        );
        privateTaggedLogs.set(tag.toString(), currentLogs);
      });

      txEffect.publicLogs.forEach(log => {
        // Public logs use Tag directly (not siloed) and are stored with contract address
        const tag = log.fields[0];
        const contractAddress = log.contractAddress;
        const key = `${contractAddress.toString()}_${tag.toString()}`;
        this.#log.debug(
          `Found public log with tag ${tag.toString()} from contract ${contractAddress.toString()} in block ${block.number}`,
        );

        const currentLogs = publicTaggedLogs.get(key) ?? [];
        currentLogs.push(
          new TxScopedL2Log(
            txHash,
            block.number,
            block.timestamp,
            log.getEmittedFields(),
            txEffect.noteHashes,
            txEffect.nullifiers[0],
          ).toBuffer(),
        );
        publicTaggedLogs.set(key, currentLogs);
      });
    });

    return { privateTaggedLogs, publicTaggedLogs };
  }

  /**
   * Extracts and aggregates tagged logs from a list of blocks.
   * @param blocks - The blocks to extract logs from.
   * @returns A map from tag (as string) to an array of serialized private logs belonging to that tag, and a map from
   * "{contractAddress}_{tag}" (as string) to an array of serialized public logs belonging to that key.
   */
  #extractTaggedLogs(blocks: L2BlockNew[]): {
    privateTaggedLogs: Map<string, Buffer[]>;
    publicTaggedLogs: Map<string, Buffer[]>;
  } {
    const taggedLogsInBlocks = blocks.map(block => this.#extractTaggedLogsFromBlock(block));

    // Now we merge the maps from each block into a single map.
    const privateTaggedLogs = taggedLogsInBlocks.reduce((acc, { privateTaggedLogs }) => {
      for (const [tag, logs] of privateTaggedLogs.entries()) {
        const currentLogs = acc.get(tag) ?? [];
        acc.set(tag, currentLogs.concat(logs));
      }
      return acc;
    }, new Map<string, Buffer[]>());

    const publicTaggedLogs = taggedLogsInBlocks.reduce((acc, { publicTaggedLogs }) => {
      for (const [key, logs] of publicTaggedLogs.entries()) {
        const currentLogs = acc.get(key) ?? [];
        acc.set(key, currentLogs.concat(logs));
      }
      return acc;
    }, new Map<string, Buffer[]>());

    return { privateTaggedLogs, publicTaggedLogs };
  }

  async #addPrivateLogs(blocks: L2BlockNew[]): Promise<void> {
    const newBlocks = await filterAsync(
      blocks,
      async block => !(await this.#privateLogKeysByBlock.hasAsync(block.number)),
    );

    const { privateTaggedLogs } = this.#extractTaggedLogs(newBlocks);
    const keysOfPrivateLogsToUpdate = Array.from(privateTaggedLogs.keys());

    const currentPrivateTaggedLogs = await Promise.all(
      keysOfPrivateLogsToUpdate.map(async key => ({
        tag: key,
        logBuffers: await this.#privateLogsByTag.getAsync(key),
      })),
    );

    for (const taggedLogBuffer of currentPrivateTaggedLogs) {
      if (taggedLogBuffer.logBuffers && taggedLogBuffer.logBuffers.length > 0) {
        privateTaggedLogs.set(
          taggedLogBuffer.tag,
          taggedLogBuffer.logBuffers!.concat(privateTaggedLogs.get(taggedLogBuffer.tag)!),
        );
      }
    }

    for (const block of newBlocks) {
      const privateTagsInBlock: string[] = [];
      for (const [tag, logs] of privateTaggedLogs.entries()) {
        await this.#privateLogsByTag.set(tag, logs);
        privateTagsInBlock.push(tag);
      }
      await this.#privateLogKeysByBlock.set(block.number, privateTagsInBlock);
    }
  }

  async #addPublicLogs(blocks: L2BlockNew[]): Promise<void> {
    const newBlocks = await filterAsync(
      blocks,
      async block => !(await this.#publicLogKeysByBlock.hasAsync(block.number)),
    );

    const { publicTaggedLogs } = this.#extractTaggedLogs(newBlocks);
    const keysOfPublicLogsToUpdate = Array.from(publicTaggedLogs.keys());

    const currentPublicTaggedLogs = await Promise.all(
      keysOfPublicLogsToUpdate.map(async key => ({
        tag: key,
        logBuffers: await this.#publicLogsByContractAndTag.getAsync(key),
      })),
    );

    for (const taggedLogBuffer of currentPublicTaggedLogs) {
      if (taggedLogBuffer.logBuffers && taggedLogBuffer.logBuffers.length > 0) {
        publicTaggedLogs.set(
          taggedLogBuffer.tag,
          taggedLogBuffer.logBuffers!.concat(publicTaggedLogs.get(taggedLogBuffer.tag)!),
        );
      }
    }

    for (const block of newBlocks) {
      const blockHash = await block.hash();
      const publicTagsInBlock: string[] = [];
      for (const [tag, logs] of publicTaggedLogs.entries()) {
        await this.#publicLogsByContractAndTag.set(tag, logs);
        publicTagsInBlock.push(tag);
      }
      await this.#publicLogKeysByBlock.set(block.number, publicTagsInBlock);

      const publicLogsInBlock = block.body.txEffects
        .map((txEffect, txIndex) =>
          [
            numToUInt32BE(txIndex),
            numToUInt32BE(txEffect.publicLogs.length),
            txEffect.publicLogs.map(log => log.toBuffer()),
          ].flat(),
        )
        .flat();

      await this.#publicLogsByBlock.set(block.number, this.#packWithBlockHash(blockHash, publicLogsInBlock));
    }
  }

  async #addContractClassLogs(blocks: L2BlockNew[]): Promise<void> {
    const newBlocks = await filterAsync(
      blocks,
      async block => !(await this.#contractClassLogsByBlock.hasAsync(block.number)),
    );

    for (const block of newBlocks) {
      const blockHash = await block.hash();

      const contractClassLogsInBlock = block.body.txEffects
        .map((txEffect, txIndex) =>
          [
            numToUInt32BE(txIndex),
            numToUInt32BE(txEffect.contractClassLogs.length),
            txEffect.contractClassLogs.map(log => log.toBuffer()),
          ].flat(),
        )
        .flat();

      await this.#contractClassLogsByBlock.set(
        block.number,
        this.#packWithBlockHash(blockHash, contractClassLogsInBlock),
      );
    }
  }

  /**
   * Append new logs to the store's list.
   * @param blocks - The blocks for which to add the logs.
   * @returns True if the operation is successful.
   */
  addLogs(blocks: L2BlockNew[]): Promise<boolean> {
    return this.db.transactionAsync(async () => {
      await Promise.all([
        this.#addPrivateLogs(blocks),
        this.#addPublicLogs(blocks),
        this.#addContractClassLogs(blocks),
      ]);
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
      await Promise.all(
        blocks.map(async block => {
          // Delete private logs
          const privateKeys = (await this.#privateLogKeysByBlock.getAsync(block.number)) ?? [];
          await Promise.all(privateKeys.map(tag => this.#privateLogsByTag.delete(tag)));

          // Delete public logs
          const publicKeys = (await this.#publicLogKeysByBlock.getAsync(block.number)) ?? [];
          await Promise.all(publicKeys.map(key => this.#publicLogsByContractAndTag.delete(key)));
        }),
      );

      await Promise.all(
        blocks.map(block =>
          Promise.all([
            this.#publicLogsByBlock.delete(block.number),
            this.#privateLogKeysByBlock.delete(block.number),
            this.#publicLogKeysByBlock.delete(block.number),
            this.#contractClassLogsByBlock.delete(block.number),
          ]),
        ),
      );

      return true;
    });
  }

  /**
   * Gets private logs that match any of the `tags`. For each tag, an array of matching logs is returned. An empty
   * array implies no logs match that tag.
   * @param tags - The tags to search for.
   * @param page - The page number (0-indexed) for pagination.
   * @returns An array of log arrays, one per tag. Returns at most MAX_LOGS_PER_TAG logs per tag per page. If
   * MAX_LOGS_PER_TAG logs are returned for a tag, the caller should fetch the next page to check for more logs.
   */
  async getPrivateLogsByTags(tags: SiloedTag[], page: number = 0): Promise<TxScopedL2Log[][]> {
    const logs = await Promise.all(tags.map(tag => this.#privateLogsByTag.getAsync(tag.toString())));
    const start = page * MAX_LOGS_PER_TAG;
    const end = start + MAX_LOGS_PER_TAG;

    return logs.map(
      logBuffers => logBuffers?.slice(start, end).map(logBuffer => TxScopedL2Log.fromBuffer(logBuffer)) ?? [],
    );
  }

  /**
   * Gets public logs that match any of the `tags` from the specified contract. For each tag, an array of matching
   * logs is returned. An empty array implies no logs match that tag.
   * @param contractAddress - The contract address to search logs for.
   * @param tags - The tags to search for.
   * @param page - The page number (0-indexed) for pagination.
   * @returns An array of log arrays, one per tag. Returns at most MAX_LOGS_PER_TAG logs per tag per page. If
   * MAX_LOGS_PER_TAG logs are returned for a tag, the caller should fetch the next page to check for more logs.
   */
  async getPublicLogsByTagsFromContract(
    contractAddress: AztecAddress,
    tags: Tag[],
    page: number = 0,
  ): Promise<TxScopedL2Log[][]> {
    const logs = await Promise.all(
      tags.map(tag => {
        const key = `${contractAddress.toString()}_${tag.value.toString()}`;
        return this.#publicLogsByContractAndTag.getAsync(key);
      }),
    );
    const start = page * MAX_LOGS_PER_TAG;
    const end = start + MAX_LOGS_PER_TAG;

    return logs.map(
      logBuffers => logBuffers?.slice(start, end).map(logBuffer => TxScopedL2Log.fromBuffer(logBuffer)) ?? [],
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
