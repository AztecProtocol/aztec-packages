import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, bigintToUInt64BE, serializeToBuffer } from '@aztec/foundation/serialize';

export type InboxMessage = {
  index: bigint;
  leaf: Fr;
  l1BlockNumber: bigint;
  l1BlockHash: Buffer32;
  /** Consensus rolling hash (truncated sha256 chain) of all messages up to and including this one. */
  inboxRollingHash: Fr;
  /** Sequence number of the Inbox bucket this message was absorbed into. */
  bucketSeq: bigint;
  /** L1 block timestamp at which this message's bucket was opened; the bucket's recency key, in seconds. */
  bucketTimestamp: bigint;
};

export function serializeInboxMessage(message: InboxMessage): Buffer {
  return serializeToBuffer([
    bigintToUInt64BE(message.index),
    message.leaf,
    message.l1BlockHash,
    bigintToUInt64BE(message.l1BlockNumber),
    message.inboxRollingHash,
    bigintToUInt64BE(message.bucketSeq),
    bigintToUInt64BE(message.bucketTimestamp),
  ]);
}

export function deserializeInboxMessage(buffer: Buffer): InboxMessage {
  const reader = BufferReader.asReader(buffer);
  const index = reader.readUInt64();
  const leaf = reader.readObject(Fr);
  const l1BlockHash = reader.readObject(Buffer32);
  const l1BlockNumber = reader.readUInt64();
  const inboxRollingHash = reader.readObject(Fr);
  const bucketSeq = reader.readUInt64();
  const bucketTimestamp = reader.readUInt64();
  return {
    index,
    leaf,
    l1BlockHash,
    l1BlockNumber,
    inboxRollingHash,
    bucketSeq,
    bucketTimestamp,
  };
}
