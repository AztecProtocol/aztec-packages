import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { BlockHash } from '@aztec/stdlib/block';
import { TxHash } from '@aztec/stdlib/tx';

export const NUMERIC_HEX_LEN = 8;
export const SEP = '-';

/**
 * Sentinel appended after a numeric hex segment to build an end bound strictly greater than any
 * real key for that namespace. `'g'` sorts lexicographically after every hex digit (`0`-`9`, `a`-`f`),
 * so `prefix + '-g'` is a clean exclusive upper bound.
 */
export const HEX_SENTINEL = 'g';

export type ParsedKeyTail = {
  blockNumber: BlockNumber;
  txIndexWithinBlock: number;
  logIndexWithinTx: number;
};

/**
 * Per-kind stored value layout (no msgpackr):
 *   txHash(32) ++ blockHash(32) ++ blockTimestamp(u64 BE = 8) ++ logDataLen(u32 BE = 4) ++ logData[i].toBuffer()...
 * `blockNumber`, `txIndexWithinBlock`, and `logIndexWithinTx` are decoded from the composite key.
 */
export type StoredLogValue = {
  txHash: TxHash;
  blockHash: BlockHash;
  blockTimestamp: bigint;
  logData: Fr[];
};

/** Returns the 64-char lowercase hex representation of a field, stripping the `0x` prefix. */
export function fieldHex(value: Fr | { toString: () => string }): string {
  // Fr.toString() and AztecAddress.toString() both return `0x` + 64 lowercase hex chars.
  return value.toString().slice(2);
}

/**
 * Tag prefix for a log: the hex of its first field, or the empty string when the log carries no fields.
 * A protocol-valid public log can have zero fields (e.g. a raw AVM `EMITPUBLICLOG` with `logSize = 0`),
 * which has no tag to index by. Encoding it under the empty tag keeps it retrievable via the per-block
 * read (and droppable on reorg) while never matching a real 64-hex-char tag query — instead of reading
 * `fields[0]` off an empty array and aborting the whole block-ingestion transaction.
 */
export function tagHexForLog(fields: Fr[]): string {
  return fields.length > 0 ? fieldHex(fields[0]) : '';
}

/** Encodes a number as 8-char zero-padded lowercase hex (matches a u32 big-endian byte buffer's lex order). */
export function u32Hex(n: number): string {
  return n.toString(16).padStart(NUMERIC_HEX_LEN, '0');
}

/**
 * Encodes the composite primary key as `prefix-block-txIdx-logIdx` where `prefix` is the leading
 * segment (`tag` for private; `contract-tag` for public) and the trailing triple is fixed-width
 * 8-char zero-padded hex so byte-order matches `(blockNumber, txIndexWithinBlock, logIndexWithinTx)`.
 */
export function encodeKey(prefix: string, blockNumber: number, txIndex: number, logIndex: number): string {
  return `${prefix}${SEP}${u32Hex(blockNumber)}${SEP}${u32Hex(txIndex)}${SEP}${u32Hex(logIndex)}`;
}

/**
 * Decodes the trailing `(blockNumber, txIndexWithinBlock, logIndexWithinTx)` triple from a composite
 * key. The leading prefix segments are ignored — we only ever read them off the input query, never
 * back off the key.
 */
export function decodeKeyTail(key: string): ParsedKeyTail {
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
export function endOfTagRange(prefix: string, upperBlockExclusive: number | undefined): string {
  if (upperBlockExclusive === undefined) {
    return `${prefix}${SEP}${HEX_SENTINEL}`;
  }
  return encodeKey(prefix, upperBlockExclusive, 0, 0);
}

/**
 * Exclusive end bound for a tx-strict scan: every key strictly inside `(prefix, txBlk, txIdx, *)`.
 * `prefix-block-txIdx-` followed by the hex sentinel is the first key past every real logIndex for
 * this tx and strictly less than the next tx's first key.
 */
export function endOfTxRange(prefix: string, txBlk: number, txIdx: number): string {
  return `${prefix}${SEP}${u32Hex(txBlk)}${SEP}${u32Hex(txIdx)}${SEP}${HEX_SENTINEL}`;
}

/**
 * Returns the smallest string strictly greater than a fully-encoded composite key. The encoded key
 * ends in a hex digit, and `'g'` sorts strictly after any hex digit, so appending `'g'` is the
 * smallest possible successor in our key alphabet. Used to turn an inclusive cursor into an
 * exclusive `start`.
 */
export function incKey(key: string): string {
  return key + HEX_SENTINEL;
}

export function encodeValue(value: StoredLogValue): Buffer {
  const head = Buffer.allocUnsafe(32 + 32 + 8 + 4);
  value.txHash.toBuffer().copy(head, 0);
  value.blockHash.toBuffer().copy(head, 32);
  head.writeBigUInt64BE(value.blockTimestamp, 64);
  head.writeUInt32BE(value.logData.length, 72);
  const fieldBufs = value.logData.map(f => f.toBuffer());
  return Buffer.concat([head, ...fieldBufs]);
}

export function decodeValue(buffer: Buffer | Uint8Array): StoredLogValue {
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

/** Encodes the public-log key prefix as `contractHex-tagHex`. */
export function encodePublicPrefix(contractHex: string, tagHex: string): string {
  return `${contractHex}${SEP}${tagHex}`;
}
