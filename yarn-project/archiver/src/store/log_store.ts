import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import { BlockHash, type L2Block } from '@aztec/stdlib/block';
import { MAX_LOGS_PER_TAG } from '@aztec/stdlib/interfaces/api-limit';
import { LogResult } from '@aztec/stdlib/logs';
import type { LogCursor, PrivateLogsQuery, PublicLogsQuery, SiloedTag, Tag, TagQuery } from '@aztec/stdlib/logs';
import { TxHash } from '@aztec/stdlib/tx';

import type { BlockStore } from './block_store.js';

const NUMERIC_HEX_LEN = 8;
const SEP = '-';
/**
 * Sentinel appended after a numeric hex segment to build an end bound strictly greater than any
 * real key for that namespace. `'g'` sorts lexicographically after every hex digit (`0`-`9`, `a`-`f`),
 * so `prefix + '-g'` is a clean exclusive upper bound.
 */
const HEX_SENTINEL = 'g';

type ParsedKeyTail = {
  blockNumber: BlockNumber;
  txIndexWithinBlock: number;
  logIndexWithinTx: number;
};

/**
 * Per-kind stored value layout (no msgpackr):
 *   txHash(32) ++ blockHash(32) ++ blockTimestamp(u64 BE = 8) ++ logDataLen(u32 BE = 4) ++ logData[i].toBuffer()...
 * `blockNumber`, `txIndexWithinBlock`, and `logIndexWithinTx` are decoded from the composite key.
 */
type StoredLogValue = {
  txHash: TxHash;
  blockHash: BlockHash;
  blockTimestamp: bigint;
  logData: Fr[];
};

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

  constructor(
    private db: AztecAsyncKVStore,
    private blockStore: BlockStore,
  ) {
    this.#privateLogs = db.openMap('archiver_private_logs');
    this.#publicLogs = db.openMap('archiver_public_logs');
    this.#privateKeysByBlock = db.openMap('archiver_private_log_keys_by_block');
    this.#publicKeysByBlock = db.openMap('archiver_public_log_keys_by_block');
  }

  /** Returns the 64-char lowercase hex representation of a field, stripping the `0x` prefix. */
  static #fieldHex(value: Fr | { toString: () => string }): string {
    // Fr.toString() and AztecAddress.toString() both return `0x` + 64 lowercase hex chars.
    return value.toString().slice(2);
  }

  /** Encodes a number as 8-char zero-padded lowercase hex (matches a u32 big-endian byte buffer's lex order). */
  static #u32Hex(n: number): string {
    return n.toString(16).padStart(NUMERIC_HEX_LEN, '0');
  }

  /**
   * Encodes the composite primary key as `prefix-block-txIdx-logIdx` where `prefix` is the leading
   * segment (`tag` for private; `contract-tag` for public) and the trailing triple is fixed-width
   * 8-char zero-padded hex so byte-order matches `(blockNumber, txIndexWithinBlock, logIndexWithinTx)`.
   */
  static #encodeKey(prefix: string, blockNumber: number, txIndex: number, logIndex: number): string {
    return `${prefix}${SEP}${LogStore.#u32Hex(blockNumber)}${SEP}${LogStore.#u32Hex(txIndex)}${SEP}${LogStore.#u32Hex(
      logIndex,
    )}`;
  }

  /**
   * Decodes the trailing `(blockNumber, txIndexWithinBlock, logIndexWithinTx)` triple from a composite
   * key. The leading prefix segments are ignored — we only ever read them off the input query, never
   * back off the key.
   */
  static #decodeKeyTail(key: string): ParsedKeyTail {
    const parts = key.split(SEP);
    const len = parts.length;
    return {
      blockNumber: BlockNumber(parseInt(parts[len - 3], 16)),
      txIndexWithinBlock: parseInt(parts[len - 2], 16),
      logIndexWithinTx: parseInt(parts[len - 1], 16),
    };
  }

  /**
   * Exclusive end bound for a `(contract, tag)`-prefix scan. With an `upperBlockExclusive` we cut at
   * `(prefix, upper, 0, 0)`. With no bound we use `prefix + '-' + HEX_SENTINEL`, which sorts strictly
   * after every real key under `prefix` (`g` is greater than any hex digit).
   */
  static #endOfTagRange(prefix: string, upperBlockExclusive: number | undefined): string {
    if (upperBlockExclusive === undefined) {
      return `${prefix}${SEP}${HEX_SENTINEL}`;
    }
    return LogStore.#encodeKey(prefix, upperBlockExclusive, 0, 0);
  }

  /**
   * Exclusive end bound for a tx-strict scan: every key strictly inside `(prefix, txBlk, txIdx, *)`.
   * `prefix-block-txIdx-` followed by the hex sentinel is the first key past every real logIndex for
   * this tx and strictly less than the next tx's first key.
   */
  static #endOfTxRange(prefix: string, txBlk: number, txIdx: number): string {
    return `${prefix}${SEP}${LogStore.#u32Hex(txBlk)}${SEP}${LogStore.#u32Hex(txIdx)}${SEP}${HEX_SENTINEL}`;
  }

  /**
   * Returns the smallest string strictly greater than a fully-encoded composite key. The encoded key
   * ends in a hex digit, and `'g'` sorts strictly after any hex digit, so appending `'g'` is the
   * smallest possible successor in our key alphabet. Used to turn an inclusive cursor into an
   * exclusive `start`.
   */
  static #inc(key: string): string {
    return key + HEX_SENTINEL;
  }

  static #encodeValue(value: StoredLogValue): Buffer {
    const head = Buffer.allocUnsafe(32 + 32 + 8 + 4);
    value.txHash.toBuffer().copy(head, 0);
    value.blockHash.toBuffer().copy(head, 32);
    head.writeBigUInt64BE(value.blockTimestamp, 64);
    head.writeUInt32BE(value.logData.length, 72);
    const fieldBufs = value.logData.map(f => f.toBuffer());
    return Buffer.concat([head, ...fieldBufs]);
  }

  static #decodeValue(buffer: Buffer | Uint8Array): StoredLogValue {
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    let off = 0;
    const txHash = TxHash.fromBuffer(buf.subarray(off, off + 32));
    off += 32;
    const blockHash = BlockHash.fromBuffer(buf.subarray(off, off + 32));
    off += 32;
    const blockTimestamp = buf.readBigUInt64BE(off);
    off += 8;
    const logDataLen = buf.readUInt32BE(off);
    off += 4;
    const logData: Fr[] = new Array(logDataLen);
    for (let i = 0; i < logDataLen; i++) {
      logData[i] = Fr.fromBuffer(buf.subarray(off, off + 32));
      off += 32;
    }
    return { txHash, blockHash, blockTimestamp, logData };
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
        const blockHash = await block.hash();
        const blockNumber = block.number;
        const blockTimestamp = block.timestamp;

        const privateKeys: string[] = [];
        const privateValues: Buffer[] = [];
        const publicKeys: string[] = [];
        const publicValues: Buffer[] = [];

        for (let txIndexWithinBlock = 0; txIndexWithinBlock < block.body.txEffects.length; txIndexWithinBlock++) {
          const txEffect = block.body.txEffects[txIndexWithinBlock];
          const txHash = txEffect.txHash;

          // logIndexWithinTx counts both private and public logs in emission order across the tx.
          let logIndexWithinTx = 0;

          for (const log of txEffect.privateLogs) {
            const tagHex = LogStore.#fieldHex(log.fields[0]);
            const key = LogStore.#encodeKey(tagHex, blockNumber, txIndexWithinBlock, logIndexWithinTx);
            const value = LogStore.#encodeValue({
              txHash,
              blockHash,
              blockTimestamp,
              logData: log.getEmittedFields(),
            });
            privateKeys.push(key);
            privateValues.push(value);
            logIndexWithinTx++;
          }

          for (const log of txEffect.publicLogs) {
            const contractHex = LogStore.#fieldHex(log.contractAddress);
            const tagHex = LogStore.#fieldHex(log.fields[0]);
            const key = LogStore.#encodeKey(
              `${contractHex}${SEP}${tagHex}`,
              blockNumber,
              txIndexWithinBlock,
              logIndexWithinTx,
            );
            const value = LogStore.#encodeValue({
              txHash,
              blockHash,
              blockTimestamp,
              logData: log.getEmittedFields(),
            });
            publicKeys.push(key);
            publicValues.push(value);
            logIndexWithinTx++;
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
    return this.db.transactionAsync(() => this.#runQuery(query, LogStore.#fieldHex(query.contractAddress)));
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

    // referenceBlock reorg check, in-transaction, against the same db the log primary maps live on.
    let referenceBlockNumber: number | undefined;
    if (query.referenceBlock) {
      const refBlk = await this.blockStore.getBlockData({ hash: query.referenceBlock });
      if (!refBlk) {
        throw new Error(
          `Reference block ${query.referenceBlock.toString()} not found in the node. This might indicate a reorg has occurred.`,
        );
      }
      referenceBlockNumber = refBlk.header.globalVariables.blockNumber;
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
      const prefix = contractHex !== undefined ? `${contractHex}${SEP}${tagHex}` : tagHex;

      const end = txLocation
        ? LogStore.#endOfTxRange(prefix, txLocation[0], txLocation[1])
        : LogStore.#endOfTagRange(prefix, upperExclusive);

      let start: string;
      if (afterLog) {
        // Cursor wins as the start; `fromBlock` is ignored (fine if the cursor sits below it). The cursor
        // carries `(blockNumber, txIndexWithinBlock, logIndexWithinTx)`, which slot directly into the
        // composite key — no tx-hash lookup needed.
        start = LogStore.#inc(
          LogStore.#encodeKey(prefix, afterLog.blockNumber, afterLog.txIndexWithinBlock, afterLog.logIndexWithinTx),
        );
      } else if (txLocation) {
        start = LogStore.#encodeKey(prefix, txLocation[0], txLocation[1], 0);
      } else {
        start = LogStore.#encodeKey(prefix, fromBlock, 0, 0);
      }

      const limit = query.limitPerTag ?? MAX_LOGS_PER_TAG;
      const out: LogResult[] = [];
      for await (const [rawKey, rawVal] of primaryMap.entriesAsync({ start, end, limit })) {
        const tail = LogStore.#decodeKeyTail(rawKey);
        const value = LogStore.#decodeValue(rawVal);
        out.push(
          new LogResult(
            value.logData,
            tail.blockNumber,
            value.blockHash,
            value.blockTimestamp,
            value.txHash,
            tail.txIndexWithinBlock,
            tail.logIndexWithinTx,
          ),
        );
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
            return new LogResult(
              log.logData,
              log.blockNumber,
              log.blockHash,
              log.blockTimestamp,
              log.txHash,
              log.txIndexWithinBlock,
              log.logIndexWithinTx,
              noteHashes,
              nullifiers,
            );
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
  getAllPrivateLogsForBlock(blockNumber: number): Promise<LogResult[]> {
    return this.db.transactionAsync(() =>
      this.#readBlockLogs(this.#privateKeysByBlock, this.#privateLogs, blockNumber),
    );
  }

  /** {@inheritDoc LogStore.getAllPrivateLogsForBlock} */
  getAllPublicLogsForBlock(blockNumber: number): Promise<LogResult[]> {
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
    const results: LogResult[] = [];
    for (const key of keys) {
      const raw = await primaryMap.getAsync(key);
      if (!raw) {
        continue;
      }
      const tail = LogStore.#decodeKeyTail(key);
      const value = LogStore.#decodeValue(raw);
      results.push(
        new LogResult(
          value.logData,
          tail.blockNumber,
          value.blockHash,
          value.blockTimestamp,
          value.txHash,
          tail.txIndexWithinBlock,
          tail.logIndexWithinTx,
        ),
      );
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
    return { tagHex: entry.tag.value.toString().slice(2), afterLog: entry.afterLog };
  }
  return { tagHex: (entry as T).value.toString().slice(2), afterLog: undefined };
}
