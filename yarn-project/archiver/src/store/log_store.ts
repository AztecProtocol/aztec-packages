import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import type { BlockHash, L2Block } from '@aztec/stdlib/block';
import { MAX_LOGS_PER_TAG } from '@aztec/stdlib/interfaces/api-limit';
import type {
  LogCursor,
  LogResult,
  PrivateLogsQuery,
  PublicLogsQuery,
  SiloedTag,
  Tag,
  TagQuery,
} from '@aztec/stdlib/logs';
import { TxHash } from '@aztec/stdlib/tx';

import type { BlockStore } from './block_store.js';
import {
  decodeKeyTail,
  decodeValue,
  encodeKey,
  encodePublicPrefix,
  encodeValue,
  endOfTagRange,
  endOfTxRange,
  fieldHex,
  incKey,
  tagHexForLog,
} from './log_store_codec.js';

/**
 * Indexes every emitted private and public log under a composite hex-string key
 * `[contractAddress (public only)]-tag-blockNumber-txIndexWithinBlock-logIndexWithinTx`,
 * where each numeric segment is zero-padded to 8 lowercase hex digits (4 bytes BE) and
 * `contractAddress` / `tag` are the bare 64-hex-char field representations (no `0x` prefix). The
 * fixed-width zero-padded hex segments sort lexicographically in the same order as the canonical
 * `(contract, tag, blockNumber, txIndexWithinBlock, logIndexWithinTx)` tuple, so a single ordered
 * range scan answers every {@link PrivateLogsQuery} / {@link PublicLogsQuery}.
 *
 * Per-block secondary indices (`#privateKeysByBlock`, `#publicKeysByBlock`) record the exact primary
 * keys written for each block so {@link deleteLogs} can drop them on reorg without having to range
 * scan by block (block isn't the leading key segment).
 *
 * Contract-class logs are no longer stored or served by the log store.
 */
export class LogStore {
  /** Primary map: composite private key (tag + tail = 96 hex chars + separators) -> serialized {@link StoredLogValue}. */
  #privateLogs: AztecAsyncMap<string, Buffer>;
  /** Primary map: composite public key (contract + tag + tail) -> serialized {@link StoredLogValue}. */
  #publicLogs: AztecAsyncMap<string, Buffer>;

  /** Secondary deletion index: blockNumber -> the exact primary keys written for that block. */
  #privateKeysByBlock: AztecAsyncMap<number, string[]>;
  #publicKeysByBlock: AztecAsyncMap<number, string[]>;

  #log = createLogger('archiver:log_store');

  /**
   * @param genesisBlockHash - Hash of the synthetic genesis block. During early sync the PXE anchors to
   *   genesis and passes its hash as a query `referenceBlock`; since the archiver never indexes the
   *   genesis block, the store recognizes this hash directly and resolves it to the genesis block number
   *   rather than mistaking it for a reorg.
   */
  constructor(
    private db: AztecAsyncKVStore,
    private blockStore: BlockStore,
    private readonly genesisBlockHash: BlockHash,
  ) {
    this.#privateLogs = db.openMap('archiver_private_logs');
    this.#publicLogs = db.openMap('archiver_public_logs');
    this.#privateKeysByBlock = db.openMap('archiver_private_log_keys_by_block');
    this.#publicKeysByBlock = db.openMap('archiver_public_log_keys_by_block');
  }

  /**
   * Indexes every emitted private and public log from the given blocks. Wraps the write in a single
   * `db.transactionAsync` so the primary entries and the per-block secondary indices stay consistent.
   *
   * A block is only ever added once; on reorg the archiver calls {@link deleteLogs} first, so we write
   * the secondary index entries with a plain `set` (overwrite) rather than read-modify-append.
   */
  addLogs(blocks: L2Block[]): Promise<boolean> {
    return this.db.transactionAsync(async () => {
      for (const block of blocks) {
        const blockHash = (await block.hash()).toBuffer();
        const blockNumber = block.number;
        const blockTimestamp = block.timestamp;

        const privateKeys: string[] = [];
        const privateValues: Buffer[] = [];
        const publicKeys: string[] = [];
        const publicValues: Buffer[] = [];

        for (let txIndexWithinBlock = 0; txIndexWithinBlock < block.body.txEffects.length; txIndexWithinBlock++) {
          const txEffect = block.body.txEffects[txIndexWithinBlock];
          const txHash = txEffect.txHash.toBuffer();

          // Private and public log indices are counted independently per tx, each starting at 0.
          let privateLogIndexWithinTx = 0;
          let publicLogIndexWithinTx = 0;

          for (const log of txEffect.privateLogs) {
            const tagHex = tagHexForLog(log.fields);
            const key = encodeKey(tagHex, blockNumber, txIndexWithinBlock, privateLogIndexWithinTx);
            const value = encodeValue({
              txHash,
              blockHash,
              blockTimestamp,
              logData: log.getEmittedFields(),
            });
            privateKeys.push(key);
            privateValues.push(value);
            privateLogIndexWithinTx++;
          }

          for (const log of txEffect.publicLogs) {
            const contractHex = fieldHex(log.contractAddress);
            const tagHex = tagHexForLog(log.fields);
            const key = encodeKey(
              encodePublicPrefix(contractHex, tagHex),
              blockNumber,
              txIndexWithinBlock,
              publicLogIndexWithinTx,
            );
            const value = encodeValue({
              txHash,
              blockHash,
              blockTimestamp,
              logData: log.getEmittedFields(),
            });
            publicKeys.push(key);
            publicValues.push(value);
            publicLogIndexWithinTx++;
          }
        }

        for (let i = 0; i < privateKeys.length; i++) {
          await this.#privateLogs.set(privateKeys[i], privateValues[i]);
        }
        for (let i = 0; i < publicKeys.length; i++) {
          await this.#publicLogs.set(publicKeys[i], publicValues[i]);
        }

        await this.#privateKeysByBlock.set(blockNumber, privateKeys);
        await this.#publicKeysByBlock.set(blockNumber, publicKeys);

        this.#log.debug(`Indexed logs for block ${blockNumber}`, {
          blockNumber,
          privateCount: privateKeys.length,
          publicCount: publicKeys.length,
        });
      }
      return true;
    });
  }

  /**
   * Deletes every log indexed under any of the given blocks. Secondary-index driven, so it doesn't
   * have to range-scan the primary maps.
   */
  deleteLogs(blocks: L2Block[]): Promise<boolean> {
    return this.db.transactionAsync(async () => {
      for (const block of blocks) {
        const blockNumber = block.number;

        const [privateKeys, publicKeys] = await Promise.all([
          this.#privateKeysByBlock.getAsync(blockNumber),
          this.#publicKeysByBlock.getAsync(blockNumber),
        ]);

        if (privateKeys) {
          for (const key of privateKeys) {
            await this.#privateLogs.delete(key);
          }
          await this.#privateKeysByBlock.delete(blockNumber);
        }
        if (publicKeys) {
          for (const key of publicKeys) {
            await this.#publicLogs.delete(key);
          }
          await this.#publicKeysByBlock.delete(blockNumber);
        }
      }
      return true;
    });
  }

  /** Returns one inner array per element of `query.tags`, in input order. */
  getPrivateLogsByTags(query: PrivateLogsQuery): Promise<LogResult[][]> {
    LogStore.#validateQuery(query);
    return this.db.transactionAsync(() => this.#runQuery(query, /* contractHex */ undefined));
  }

  /** Returns one inner array per element of `query.tags`, in input order. */
  getPublicLogsByTags(query: PublicLogsQuery): Promise<LogResult[][]> {
    LogStore.#validateQuery(query);
    return this.db.transactionAsync(() => this.#runQuery(query, fieldHex(query.contractAddress)));
  }

  static #validateQuery(query: { txHash?: TxHash; fromBlock?: unknown; toBlock?: unknown }): void {
    if (query.txHash !== undefined && (query.fromBlock !== undefined || query.toBlock !== undefined)) {
      throw new Error('`txHash` is mutually exclusive with `fromBlock`/`toBlock`');
    }
  }

  async #runQuery(query: PrivateLogsQuery | PublicLogsQuery, contractHex: string | undefined): Promise<LogResult[][]> {
    const isPublic = contractHex !== undefined;
    const tags = (query.tags as ReadonlyArray<TagQuery<Tag | SiloedTag>>) ?? [];
    const primaryMap = isPublic ? this.#publicLogs : this.#privateLogs;

    // referenceBlock reorg check, in-transaction, against the same db the log primary maps live on. The
    // genesis block is a valid anchor during early sync but is synthetic and never indexed in the block
    // store, so resolve it directly to the genesis block number rather than mistaking it for a reorg.
    let referenceBlockNumber: number | undefined;
    if (query.referenceBlock) {
      if (query.referenceBlock.equals(this.genesisBlockHash)) {
        referenceBlockNumber = INITIAL_L2_BLOCK_NUM - 1;
      } else {
        const refBlk = await this.blockStore.getBlockData({ hash: query.referenceBlock });
        if (!refBlk) {
          throw new Error(
            `Reference block ${query.referenceBlock.toString()} not found in the node. This might indicate a reorg has occurred.`,
          );
        }
        referenceBlockNumber = refBlk.header.globalVariables.blockNumber;
      }
    }

    // Compute the exclusive upper-block bound across `toBlock` and `referenceBlock`.
    // `toBlock` is already exclusive; `referenceBlock` caps inclusively, so its exclusive form is +1.
    let upperExclusive: number | undefined;
    if (query.toBlock !== undefined) {
      upperExclusive = query.toBlock;
    }
    if (referenceBlockNumber !== undefined) {
      const refExclusive = referenceBlockNumber + 1;
      upperExclusive = upperExclusive === undefined ? refExclusive : Math.min(upperExclusive, refExclusive);
    }

    // Resolve txHash -> (blockNumber, txIndexInBlock) once for the whole query.
    let txLocation: [number, number] | undefined;
    if (query.txHash) {
      const loc = await this.blockStore.getTxLocation(query.txHash);
      if (!loc) {
        return tags.map(() => []);
      }
      txLocation = loc;
      if (upperExclusive !== undefined && txLocation[0] >= upperExclusive) {
        return tags.map(() => []);
      }
    }

    const fromBlock = query.fromBlock ?? INITIAL_L2_BLOCK_NUM;
    const includeEffects = query.includeEffects === true;

    const perTagResults: LogResult[][] = [];
    for (const tagEntry of tags) {
      const { tagHex, afterLog } = normalizeTagEntry(tagEntry);
      const prefix = contractHex !== undefined ? encodePublicPrefix(contractHex, tagHex) : tagHex;

      const end = txLocation
        ? endOfTxRange(prefix, txLocation[0], txLocation[1])
        : endOfTagRange(prefix, upperExclusive);

      let start: string;
      if (afterLog) {
        // Cursor wins as the start; `fromBlock` is ignored (fine if the cursor sits below it). The cursor
        // carries `(blockNumber, txIndexWithinBlock, logIndexWithinTx)`, which slot directly into the
        // composite key — no tx-hash lookup needed.
        start = incKey(encodeKey(prefix, afterLog.blockNumber, afterLog.txIndexWithinBlock, afterLog.logIndexWithinTx));
      } else if (txLocation) {
        start = encodeKey(prefix, txLocation[0], txLocation[1], 0);
      } else {
        start = encodeKey(prefix, fromBlock, 0, 0);
      }

      const limit = query.limitPerTag ?? MAX_LOGS_PER_TAG;
      const out: LogResult[] = [];
      for await (const [rawKey, rawVal] of primaryMap.entriesAsync({ start, end, limit })) {
        const tail = decodeKeyTail(rawKey);
        const value = decodeValue(rawVal);
        out.push({
          logData: value.logData,
          blockNumber: tail.blockNumber,
          blockHash: value.blockHash,
          blockTimestamp: value.blockTimestamp,
          txHash: value.txHash,
          txIndexWithinBlock: tail.txIndexWithinBlock,
          logIndexWithinTx: tail.logIndexWithinTx,
        });
      }
      perTagResults.push(out);
    }

    if (includeEffects) {
      // Dedupe by txHash across the entire page so a tx with many tagged logs costs one fetch.
      const txHashByKey = new Map<string, TxHash>();
      for (const arr of perTagResults) {
        for (const log of arr) {
          txHashByKey.set(log.txHash.toString(), log.txHash);
        }
      }
      const uniqueTxs = Array.from(txHashByKey.values());
      if (uniqueTxs.length > 0) {
        const effects = await this.blockStore.getNoteHashesAndNullifiers(uniqueTxs);
        const byTxHash = new Map<string, [Fr[], Fr[]]>();
        uniqueTxs.forEach((tx, i) => byTxHash.set(tx.toString(), effects[i]));
        for (let i = 0; i < perTagResults.length; i++) {
          perTagResults[i] = perTagResults[i].map(log => {
            const [noteHashes, nullifiers] = byTxHash.get(log.txHash.toString()) ?? [[], []];
            return { ...log, noteHashes, nullifiers };
          });
        }
      }
    }

    return perTagResults;
  }

  /**
   * Reads back every private log indexed for the given block via the per-block secondary index. Order
   * matches the canonical composite-key order (`tag`, `blockNumber`, `txIndexWithinBlock`,
   * `logIndexWithinTx`). Used by the data-store-updater test suite to verify the indexed-vs-block-body
   * counts without depending on the removed `getPublicLogs(LogFilter)` API.
   */
  getPrivateLogsForBlock(blockNumber: number): Promise<LogResult[]> {
    return this.db.transactionAsync(() =>
      this.#readBlockLogs(this.#privateKeysByBlock, this.#privateLogs, blockNumber),
    );
  }

  /** {@inheritDoc LogStore.getPrivateLogsForBlock} */
  getPublicLogsForBlock(blockNumber: number): Promise<LogResult[]> {
    return this.db.transactionAsync(() => this.#readBlockLogs(this.#publicKeysByBlock, this.#publicLogs, blockNumber));
  }

  async #readBlockLogs(
    keysByBlock: AztecAsyncMap<number, string[]>,
    primaryMap: AztecAsyncMap<string, Buffer>,
    blockNumber: number,
  ): Promise<LogResult[]> {
    const keys = await keysByBlock.getAsync(blockNumber);
    if (!keys || keys.length === 0) {
      return [];
    }
    const raws = await primaryMap.getManyAsync(keys);
    const results: LogResult[] = [];
    for (let i = 0; i < keys.length; i++) {
      const raw = raws[i];
      if (!raw) {
        continue;
      }
      const key = keys[i];
      const tail = decodeKeyTail(key);
      const value = decodeValue(raw);
      results.push({
        logData: value.logData,
        blockNumber: tail.blockNumber,
        blockHash: value.blockHash,
        blockTimestamp: value.blockTimestamp,
        txHash: value.txHash,
        txIndexWithinBlock: tail.txIndexWithinBlock,
        logIndexWithinTx: tail.logIndexWithinTx,
      });
    }
    return results;
  }
}

/** Pulls `{ tagHex, afterLog }` out of a {@link TagQuery}, normalizing the bare-tag form. */
function normalizeTagEntry<T extends Tag | SiloedTag>(
  entry: TagQuery<T>,
): {
  tagHex: string;
  afterLog: LogCursor | undefined;
} {
  if (typeof entry === 'object' && entry !== null && 'tag' in entry) {
    return { tagHex: fieldHex(entry.tag.value), afterLog: entry.afterLog };
  }
  return { tagHex: fieldHex((entry as T).value), afterLog: undefined };
}
