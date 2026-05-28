import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import type { AztecAsyncBinaryMap, AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import { BlockHash, type L2Block } from '@aztec/stdlib/block';
import { MAX_LOGS_PER_TAG } from '@aztec/stdlib/interfaces/api-limit';
import { LogCursor, LogResult } from '@aztec/stdlib/logs';
import type { PrivateLogsQuery, PublicLogsQuery, SiloedTag, Tag, TagQuery } from '@aztec/stdlib/logs';
import { TxHash } from '@aztec/stdlib/tx';

import type { BlockStore } from './block_store.js';

/** Width in bytes of each fixed-width segment of the composite log key's trailing triple. */
const BLOCK_LEN = 4;
const TXIDX_LEN = 4;
const LOGIDX_LEN = 4;

const TAIL_LEN = BLOCK_LEN + TXIDX_LEN + LOGIDX_LEN;
const MAX_U32 = 0xffffffff;

type ParsedKeyTail = {
  blockNumber: BlockNumber;
  txIndexWithinBlock: number;
  logIndexWithinTx: number;
};

/**
 * Per-kind stored value layout (no msgpackr):
 *   txHash(32) ++ blockHash(32) ++ blockTimestamp(u64 BE = 8) ++ logDataLen(u32 BE = 4) ++ logData[i].toBuffer()...
 * `blockNumber` and `logIndexWithinTx` are decoded from the primary key, not duplicated here.
 */
type StoredLogValue = {
  txHash: TxHash;
  blockHash: BlockHash;
  blockTimestamp: bigint;
  logData: Fr[];
};

/**
 * Indexes every emitted private and public log under a composite key
 * `[contractAddress (public only)] ++ tag ++ blockNumber ++ txIndexWithinBlock ++ logIndexWithinTx`,
 * stored as raw fixed-width big-endian bytes so LMDB's `memcmp` ordering equals canonical block-execution
 * order. A single range scan with the right prefix answers every {@link PrivateLogsQuery} /
 * {@link PublicLogsQuery}.
 *
 * Per-block secondary indices (`#privateKeysByBlock`, `#publicKeysByBlock`) record the raw primary keys
 * written for each block, so {@link deleteLogs} can drop them on reorg without having to range-scan by
 * block (block isn't the key prefix).
 *
 * Contract-class logs are no longer stored or served by the log store.
 */
export class LogStore {
  /** Primary map: composite private key (44 bytes) -> serialized {@link StoredLogValue}. */
  #privateLogs: AztecAsyncBinaryMap;
  /** Primary map: composite public key (76 bytes) -> serialized {@link StoredLogValue}. */
  #publicLogs: AztecAsyncBinaryMap;

  /** Secondary deletion index: blockNumber -> the raw primary keys written for that block. */
  #privateKeysByBlock: AztecAsyncMap<number, Buffer[]>;
  #publicKeysByBlock: AztecAsyncMap<number, Buffer[]>;

  #log = createLogger('archiver:log_store');

  constructor(
    private db: AztecAsyncKVStore,
    private blockStore: BlockStore,
    // Reserved for future use; the new layout uses the global MAX_LOGS_PER_TAG cap directly.
    _logsMaxPageSize: number = 1000,
  ) {
    this.#privateLogs = db.openBinaryMap('archiver_private_logs');
    this.#publicLogs = db.openBinaryMap('archiver_public_logs');
    this.#privateKeysByBlock = db.openMap('archiver_private_log_keys_by_block');
    this.#publicKeysByBlock = db.openMap('archiver_public_log_keys_by_block');
  }

  // -----------------------------------------------------------------------------------------------
  // Key codec — keep this section narrow; everything else depends on these helpers.
  // -----------------------------------------------------------------------------------------------

  /**
   * Encodes a composite primary key as fixed-width big-endian raw bytes. `prefix` is the leading byte
   * slice (`tag` for private; `contractAddress ++ tag` for public). All three trailing fields are u32
   * big-endian, so `Buffer.compare` over the result mirrors `(prefix, blockNumber, txIndexWithinBlock,
   * logIndexWithinTx)` order.
   */
  static #encodeKey(prefix: Buffer, blockNumber: number, txIndex: number, logIndex: number): Buffer {
    const tail = Buffer.allocUnsafe(TAIL_LEN);
    tail.writeUInt32BE(blockNumber, 0);
    tail.writeUInt32BE(txIndex, BLOCK_LEN);
    tail.writeUInt32BE(logIndex, BLOCK_LEN + TXIDX_LEN);
    return Buffer.concat([prefix, tail]);
  }

  /** Decodes `(blockNumber, txIndexWithinBlock, logIndexWithinTx)` from the trailing 12 bytes of a key. */
  static #decodeKeyTail(key: Buffer | Uint8Array): ParsedKeyTail {
    const buf = Buffer.isBuffer(key) ? key : Buffer.from(key.buffer, key.byteOffset, key.byteLength);
    const tailStart = buf.length - TAIL_LEN;
    return {
      blockNumber: BlockNumber(buf.readUInt32BE(tailStart)),
      txIndexWithinBlock: buf.readUInt32BE(tailStart + BLOCK_LEN),
      logIndexWithinTx: buf.readUInt32BE(tailStart + BLOCK_LEN + TXIDX_LEN),
    };
  }

  /**
   * Smallest buffer strictly greater than `buf` in `memcmp` order — `buf` with a `1` added to its last
   * byte and carried up. If every byte is `0xff` we append a `0x00` so the result still sorts strictly
   * after (no real key shares it). Used to convert an inclusive cursor into an exclusive start bound
   * and to build end sentinels.
   */
  static #inc(buf: Buffer): Buffer {
    const out = Buffer.from(buf);
    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i] !== 0xff) {
        out[i] = out[i] + 1;
        return out.subarray(0, i + 1);
      }
    }
    return Buffer.concat([buf, Buffer.from([0x00])]);
  }

  /**
   * Exclusive end bound for a `(contract, tag)`-prefix scan. With an `upperBlockExclusive` we cut at
   * `(prefix, upper, 0, 0)`. With no bound the cleanest sentinel is `inc(prefix)` — the first byte
   * sequence after the entire prefix namespace.
   */
  static #endOfTagRange(prefix: Buffer, upperBlockExclusive: number | undefined): Buffer {
    if (upperBlockExclusive === undefined) {
      return LogStore.#inc(prefix);
    }
    return LogStore.#encodeKey(prefix, upperBlockExclusive, 0, 0);
  }

  /**
   * Exclusive end bound for a tx-strict scan: every key strictly inside `(prefix, txBlk, txIdx, *)`.
   * `inc(key(prefix, txBlk, txIdx, MAX_U32))` is the first byte sequence past every real logIndex for
   * this tx and strictly less than the next tx's first key.
   */
  static #endOfTxRange(prefix: Buffer, txBlk: number, txIdx: number): Buffer {
    return LogStore.#inc(LogStore.#encodeKey(prefix, txBlk, txIdx, MAX_U32));
  }

  // -----------------------------------------------------------------------------------------------
  // Value codec
  // -----------------------------------------------------------------------------------------------

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

  // -----------------------------------------------------------------------------------------------
  // Writes
  // -----------------------------------------------------------------------------------------------

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

        const privateKeys: Buffer[] = [];
        const privateValues: Buffer[] = [];
        const publicKeys: Buffer[] = [];
        const publicValues: Buffer[] = [];

        for (let txIndexWithinBlock = 0; txIndexWithinBlock < block.body.txEffects.length; txIndexWithinBlock++) {
          const txEffect = block.body.txEffects[txIndexWithinBlock];
          const txHash = txEffect.txHash;

          // logIndexWithinTx counts both private and public logs in emission order across the tx.
          let logIndexWithinTx = 0;

          for (const log of txEffect.privateLogs) {
            const tagBytes = log.fields[0].toBuffer();
            const key = LogStore.#encodeKey(tagBytes, blockNumber, txIndexWithinBlock, logIndexWithinTx);
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
            const contractBytes = log.contractAddress.toBuffer();
            const tagBytes = log.fields[0].toBuffer();
            const key = LogStore.#encodeKey(
              Buffer.concat([contractBytes, tagBytes]),
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

  // -----------------------------------------------------------------------------------------------
  // Reads
  // -----------------------------------------------------------------------------------------------

  /** Returns one inner array per element of `query.tags`, in input order. */
  getPrivateLogsByTags(query: PrivateLogsQuery): Promise<LogResult[][]> {
    LogStore.#validateQuery(query);
    return this.db.transactionAsync(() => this.#runQuery(query, /* contractBytes */ undefined));
  }

  /** Returns one inner array per element of `query.tags`, in input order. */
  getPublicLogsByTags(query: PublicLogsQuery): Promise<LogResult[][]> {
    LogStore.#validateQuery(query);
    return this.db.transactionAsync(() => this.#runQuery(query, query.contractAddress.toBuffer()));
  }

  static #validateQuery(query: {
    txHash?: TxHash;
    fromBlock?: unknown;
    toBlock?: unknown;
    tags?: ReadonlyArray<TagQuery<Tag | SiloedTag>>;
  }): void {
    if (query.txHash !== undefined && (query.fromBlock !== undefined || query.toBlock !== undefined)) {
      throw new Error('`txHash` is mutually exclusive with `fromBlock`/`toBlock`');
    }
    // `txHash` + `afterLog` is allowed only when the cursor refers to the same tx — otherwise the cursor
    // start would sit before the tx range and the scan would leak logs from intervening txs of the same
    // tag. Cursors come from previously-returned logs, so callers paginating within a tx will satisfy
    // this naturally; the check rejects the mismatched-cursor edge case loudly.
    if (query.txHash !== undefined && query.tags !== undefined) {
      for (const entry of query.tags) {
        const afterLog = typeof entry === 'object' && 'afterLog' in entry ? entry.afterLog : undefined;
        if (afterLog !== undefined && !afterLog.txHash.equals(query.txHash)) {
          throw new Error('`afterLog.txHash` must equal `query.txHash` when both are set');
        }
      }
    }
  }

  async #runQuery(
    query: PrivateLogsQuery | PublicLogsQuery,
    contractBytes: Buffer | undefined,
  ): Promise<LogResult[][]> {
    const isPublic = contractBytes !== undefined;
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
      const { tagBytes, afterLog } = normalizeTagEntry(tagEntry);
      const prefix = contractBytes !== undefined ? Buffer.concat([contractBytes, tagBytes]) : tagBytes;

      const end = txLocation
        ? LogStore.#endOfTxRange(prefix, txLocation[0], txLocation[1])
        : LogStore.#endOfTagRange(prefix, upperExclusive);

      let start: Buffer;
      if (afterLog) {
        // Cursor wins as the start; `fromBlock` is ignored (fine if the cursor sits below it).
        const [cursorBlock, cursorTxIdx] = await this.#resolveCursor(afterLog);
        start = LogStore.#inc(LogStore.#encodeKey(prefix, cursorBlock, cursorTxIdx, afterLog.logIndexWithinTx));
      } else if (txLocation) {
        start = LogStore.#encodeKey(prefix, txLocation[0], txLocation[1], 0);
      } else {
        start = LogStore.#encodeKey(prefix, fromBlock, 0, 0);
      }

      const out: LogResult[] = [];
      for await (const [rawKey, rawVal] of primaryMap.entriesAsync({ start, end, limit: MAX_LOGS_PER_TAG })) {
        const tail = LogStore.#decodeKeyTail(rawKey);
        const value = LogStore.#decodeValue(rawVal);
        out.push(
          new LogResult(
            value.logData,
            tail.blockNumber,
            value.blockHash,
            value.blockTimestamp,
            value.txHash,
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
   * Resolves a cursor's `txHash` to its `(blockNumber, txIndexWithinBlock)` via the block store. Throws
   * if the cursor's tx isn't found — the cursor came from a previously-returned log, so a missing tx
   * indicates a reorg under the client; they should re-sync from a fresh `referenceBlock`. Falling back
   * to `(cursor.blockNumber, 0)` would silently re-yield earlier logs in that block.
   */
  async #resolveCursor(cursor: LogCursor): Promise<[number, number]> {
    const loc = await this.blockStore.getTxLocation(cursor.txHash);
    if (!loc) {
      throw new Error(
        `Cursor tx ${cursor.txHash.toString()} not found — likely a reorg invalidated the cursor; client should re-sync.`,
      );
    }
    return loc;
  }
}

/** Pulls `{ tagBytes, afterLog }` out of a {@link TagQuery}, normalizing the bare-tag form. */
function normalizeTagEntry<T extends Tag | SiloedTag>(
  entry: TagQuery<T>,
): {
  tagBytes: Buffer;
  afterLog: LogCursor | undefined;
} {
  if (typeof entry === 'object' && entry !== null && 'tag' in entry) {
    return { tagBytes: entry.tag.value.toBuffer(), afterLog: entry.afterLog };
  }
  return { tagBytes: (entry as T).value.toBuffer(), afterLog: undefined };
}
