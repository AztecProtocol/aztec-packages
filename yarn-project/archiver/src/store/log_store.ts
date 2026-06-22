import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { compactArray, filterAsync } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { BufferReader, numToUInt32BE } from '@aztec/foundation/serialize';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash, L2Block } from '@aztec/stdlib/block';
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
import { TxHash } from '@aztec/stdlib/tx';

import type { BlockStore } from './block_store.js';

/**
 * Tag key for a log: the string form of its first field, or the empty string when the log carries no
 * fields. A protocol-valid public log can carry zero fields (e.g. a raw AVM `EMITPUBLICLOG` with
 * `logSize = 0`), which has no tag to index by. Keying it under the empty tag keeps it retrievable via
 * the per-block read (and droppable on reorg) while never matching a real tag query — instead of reading
 * `fields[0]` off an empty array and aborting the whole block-ingestion transaction.
 */
function tagKeyForLog(fields: Fr[]): string {
  return fields.length > 0 ? fields[0].toString() : '';
}

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
  #extractTaggedLogsFromBlock(block: L2Block) {
    // SiloedTag (as string) -> array of log buffers.
    const privateTaggedLogs = new Map<string, Buffer[]>();
    // "{contractAddress}_{tag}" (as string) -> array of log buffers.
    const publicTaggedLogs = new Map<string, Buffer[]>();

    block.body.txEffects.forEach(txEffect => {
      const txHash = txEffect.txHash;

      txEffect.privateLogs.forEach(log => {
        // Private logs use SiloedTag (already siloed by kernel). A zero-field log has no tag and is keyed
        // under the empty tag rather than throwing on log.fields[0].
        const tagKey = tagKeyForLog(log.fields);
        this.#log.debug(`Found private log with tag ${tagKey} in block ${block.number}`);

        const currentLogs = privateTaggedLogs.get(tagKey) ?? [];
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
        privateTaggedLogs.set(tagKey, currentLogs);
      });

      txEffect.publicLogs.forEach(log => {
        // Public logs use Tag directly (not siloed) and are stored with contract address. A zero-field
        // log has no tag and is keyed under the empty tag rather than throwing on log.fields[0].
        const tagKey = tagKeyForLog(log.fields);
        const contractAddress = log.contractAddress;
        const key = `${contractAddress.toString()}_${tagKey}`;
        this.#log.debug(
          `Found public log with tag ${tagKey} from contract ${contractAddress.toString()} in block ${block.number}`,
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
  #extractTaggedLogs(blocks: L2Block[]): {
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

  async #addPrivateLogs(blocks: L2Block[]): Promise<void> {
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

  async #addPublicLogs(blocks: L2Block[]): Promise<void> {
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
            txEffect.txHash.toBuffer(),
            numToUInt32BE(txEffect.publicLogs.length),
            txEffect.publicLogs.map(log => log.toBuffer()),
          ].flat(),
        )
        .flat();

      await this.#publicLogsByBlock.set(block.number, this.#packWithBlockHash(blockHash, publicLogsInBlock));
    }
  }

  async #addContractClassLogs(blocks: L2Block[]): Promise<void> {
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
            txEffect.txHash.toBuffer(),
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
  addLogs(blocks: L2Block[]): Promise<boolean> {
    return this.db.transactionAsync(async () => {
      await Promise.all([
        this.#addPrivateLogs(blocks),
        this.#addPublicLogs(blocks),
        this.#addContractClassLogs(blocks),
      ]);
      return true;
    });
  }

  #packWithBlockHash(blockHash: BlockHash, data: Buffer<ArrayBufferLike>[]): Buffer<ArrayBufferLike> {
    return Buffer.concat([blockHash.toBuffer(), ...data]);
  }

  #unpackBlockHash(reader: BufferReader): BlockHash {
    const blockHash = reader.remainingBytes() > 0 ? reader.readObject(Fr) : undefined;

    if (!blockHash) {
      throw new Error('Failed to read block hash from log entry buffer');
    }

    return new BlockHash(blockHash);
  }

  deleteLogs(blocks: L2Block[]): Promise<boolean> {
    return this.db.transactionAsync(async () => {
      const blockNumbers = new Set(blocks.map(block => block.number));
      const firstBlockToDelete = Math.min(...blockNumbers);

      // Collect all unique private tags across all blocks being deleted
      const allPrivateTags = new Set(
        compactArray(await Promise.all(blocks.map(block => this.#privateLogKeysByBlock.getAsync(block.number)))).flat(),
      );

      // Trim private logs: for each tag, delete all instances including and after the first block being deleted.
      // This hinges on the invariant that logs for a given tag are always inserted in order of block number, which is enforced in #addPrivateLogs.
      for (const tag of allPrivateTags) {
        const existing = await this.#privateLogsByTag.getAsync(tag);
        if (existing === undefined || existing.length === 0) {
          continue;
        }
        const lastIndexToKeep = existing.findLastIndex(
          buf => TxScopedL2Log.getBlockNumberFromBuffer(buf) < firstBlockToDelete,
        );
        const remaining = existing.slice(0, lastIndexToKeep + 1);
        await (remaining.length > 0 ? this.#privateLogsByTag.set(tag, remaining) : this.#privateLogsByTag.delete(tag));
      }

      // Collect all unique public keys across all blocks being deleted
      const allPublicKeys = new Set(
        compactArray(await Promise.all(blocks.map(block => this.#publicLogKeysByBlock.getAsync(block.number)))).flat(),
      );

      // And do the same as we did with private logs
      for (const key of allPublicKeys) {
        const existing = await this.#publicLogsByContractAndTag.getAsync(key);
        if (existing === undefined || existing.length === 0) {
          continue;
        }
        const lastIndexToKeep = existing.findLastIndex(
          buf => TxScopedL2Log.getBlockNumberFromBuffer(buf) < firstBlockToDelete,
        );
        const remaining = existing.slice(0, lastIndexToKeep + 1);
        await (remaining.length > 0
          ? this.#publicLogsByContractAndTag.set(key, remaining)
          : this.#publicLogsByContractAndTag.delete(key));
      }

      // After trimming the tagged logs, we can delete the block-level keys that track which tags are in which blocks.
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
    const publicLogsInBlock: { txHash: TxHash; logs: PublicLog[] }[] = [];
    const reader = new BufferReader(buffer);

    const blockHash = this.#unpackBlockHash(reader);

    while (reader.remainingBytes() > 0) {
      const indexOfTx = reader.readNumber();
      const txHash = reader.readObject(TxHash);
      const numLogsInTx = reader.readNumber();
      publicLogsInBlock[indexOfTx] = { txHash, logs: [] };
      for (let i = 0; i < numLogsInTx; i++) {
        publicLogsInBlock[indexOfTx].logs.push(reader.readObject(PublicLog));
      }
    }

    const txData = publicLogsInBlock[txIndex];

    const logs: ExtendedPublicLog[] = [];
    const maxLogsHit = this.#accumulatePublicLogs(
      logs,
      blockNumber,
      blockHash,
      txIndex,
      txData.txHash,
      txData.logs,
      filter,
    );

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
      const publicLogsInBlock: { txHash: TxHash; logs: PublicLog[] }[] = [];
      const reader = new BufferReader(logBuffer);

      const blockHash = this.#unpackBlockHash(reader);

      while (reader.remainingBytes() > 0) {
        const indexOfTx = reader.readNumber();
        const txHash = reader.readObject(TxHash);
        const numLogsInTx = reader.readNumber();
        publicLogsInBlock[indexOfTx] = { txHash, logs: [] };
        for (let i = 0; i < numLogsInTx; i++) {
          publicLogsInBlock[indexOfTx].logs.push(reader.readObject(PublicLog));
        }
      }
      for (let txIndex = filter.afterLog?.txIndex ?? 0; txIndex < publicLogsInBlock.length; txIndex++) {
        const txData = publicLogsInBlock[txIndex];
        maxLogsHit = this.#accumulatePublicLogs(
          logs,
          blockNumber,
          blockHash,
          txIndex,
          txData.txHash,
          txData.logs,
          filter,
        );
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
    const contractClassLogsInBlock: { txHash: TxHash; logs: ContractClassLog[] }[] = [];

    const reader = new BufferReader(contractClassLogsBuffer);
    const blockHash = this.#unpackBlockHash(reader);

    while (reader.remainingBytes() > 0) {
      const indexOfTx = reader.readNumber();
      const txHash = reader.readObject(TxHash);
      const numLogsInTx = reader.readNumber();
      contractClassLogsInBlock[indexOfTx] = { txHash, logs: [] };
      for (let i = 0; i < numLogsInTx; i++) {
        contractClassLogsInBlock[indexOfTx].logs.push(reader.readObject(ContractClassLog));
      }
    }

    const txData = contractClassLogsInBlock[txIndex];

    const logs: ExtendedContractClassLog[] = [];
    const maxLogsHit = this.#accumulateContractClassLogs(
      logs,
      blockNumber,
      blockHash,
      txIndex,
      txData.txHash,
      txData.logs,
      filter,
    );

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
      const contractClassLogsInBlock: { txHash: TxHash; logs: ContractClassLog[] }[] = [];
      const reader = new BufferReader(logBuffer);
      const blockHash = this.#unpackBlockHash(reader);
      while (reader.remainingBytes() > 0) {
        const indexOfTx = reader.readNumber();
        const txHash = reader.readObject(TxHash);
        const numLogsInTx = reader.readNumber();
        contractClassLogsInBlock[indexOfTx] = { txHash, logs: [] };
        for (let i = 0; i < numLogsInTx; i++) {
          contractClassLogsInBlock[indexOfTx].logs.push(reader.readObject(ContractClassLog));
        }
      }
      for (let txIndex = filter.afterLog?.txIndex ?? 0; txIndex < contractClassLogsInBlock.length; txIndex++) {
        const txData = contractClassLogsInBlock[txIndex];
        maxLogsHit = this.#accumulateContractClassLogs(
          logs,
          blockNumber,
          blockHash,
          txIndex,
          txData.txHash,
          txData.logs,
          filter,
        );
        if (maxLogsHit) {
          this.#log.debug(`Max logs hit at block ${blockNumber}`);
          break loopOverBlocks;
        }
      }
    }

    return { logs, maxLogsHit };
  }

  #accumulatePublicLogs(
    results: ExtendedPublicLog[],
    blockNumber: number,
    blockHash: BlockHash,
    txIndex: number,
    txHash: TxHash,
    txLogs: PublicLog[],
    filter: LogFilter = {},
  ): boolean {
    if (filter.fromBlock && blockNumber < filter.fromBlock) {
      return false;
    }
    if (filter.toBlock && blockNumber >= filter.toBlock) {
      return false;
    }
    if (filter.txHash && !txHash.equals(filter.txHash)) {
      return false;
    }

    let maxLogsHit = false;
    let logIndex = typeof filter.afterLog?.logIndex === 'number' ? filter.afterLog.logIndex + 1 : 0;
    for (; logIndex < txLogs.length; logIndex++) {
      const log = txLogs[logIndex];
      if (
        (!filter.contractAddress || log.contractAddress.equals(filter.contractAddress)) &&
        (!filter.tag || log.fields[0]?.equals(filter.tag))
      ) {
        results.push(
          new ExtendedPublicLog(new LogId(BlockNumber(blockNumber), blockHash, txHash, txIndex, logIndex), log),
        );

        if (results.length >= this.#logsMaxPageSize) {
          maxLogsHit = true;
          break;
        }
      }
    }

    return maxLogsHit;
  }

  #accumulateContractClassLogs(
    results: ExtendedContractClassLog[],
    blockNumber: number,
    blockHash: BlockHash,
    txIndex: number,
    txHash: TxHash,
    txLogs: ContractClassLog[],
    filter: LogFilter = {},
  ): boolean {
    if (filter.fromBlock && blockNumber < filter.fromBlock) {
      return false;
    }
    if (filter.toBlock && blockNumber >= filter.toBlock) {
      return false;
    }
    if (filter.txHash && !txHash.equals(filter.txHash)) {
      return false;
    }

    let maxLogsHit = false;
    let logIndex = typeof filter.afterLog?.logIndex === 'number' ? filter.afterLog.logIndex + 1 : 0;
    for (; logIndex < txLogs.length; logIndex++) {
      const log = txLogs[logIndex];
      if (!filter.contractAddress || log.contractAddress.equals(filter.contractAddress)) {
        results.push(
          new ExtendedContractClassLog(new LogId(BlockNumber(blockNumber), blockHash, txHash, txIndex, logIndex), log),
        );

        if (results.length >= this.#logsMaxPageSize) {
          maxLogsHit = true;
          break;
        }
      }
    }

    return maxLogsHit;
  }
}
