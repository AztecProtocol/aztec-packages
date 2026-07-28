import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { Buffer16, Buffer32 } from '@aztec/foundation/buffer';
import { keccak256 } from '@aztec/foundation/crypto/keccak';
import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, bigintToUInt64BE, numToUInt32BE, serializeToBuffer } from '@aztec/foundation/serialize';

export type InboxMessage = {
  index: bigint;
  leaf: Fr;
  checkpointNumber: CheckpointNumber;
  l1BlockNumber: bigint;
  l1BlockHash: Buffer32;
  /** Legacy 128-bit keccak rolling hash of all messages inserted up to and including this one. */
  rollingHash: Buffer16;
  /** Consensus rolling hash (truncated sha256 chain) of all messages up to and including this one (AZIP-22 Fast Inbox). */
  inboxRollingHash: Fr;
  /** Sequence number of the Inbox bucket this message was absorbed into (AZIP-22 Fast Inbox). */
  bucketSeq: bigint;
  /** L1 block timestamp at which this message's bucket was opened; the bucket's recency key, in seconds. */
  bucketTimestamp: bigint;
};

export function updateRollingHash(currentRollingHash: Buffer16, leaf: Fr): Buffer16 {
  const input = Buffer.concat([currentRollingHash.toBuffer(), leaf.toBuffer()]);
  return Buffer16.fromBuffer(keccak256(input));
}

export function serializeInboxMessage(message: InboxMessage): Buffer {
  return serializeToBuffer([
    bigintToUInt64BE(message.index),
    message.leaf,
    message.l1BlockHash,
    bigintToUInt64BE(message.l1BlockNumber),
    numToUInt32BE(message.checkpointNumber),
    message.rollingHash,
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
  const checkpointNumber = CheckpointNumber(reader.readNumber());
  const rollingHash = reader.readObject(Buffer16);
  const inboxRollingHash = reader.readObject(Fr);
  const bucketSeq = reader.readUInt64();
  const bucketTimestamp = reader.readUInt64();
  return {
    index,
    leaf,
    l1BlockHash,
    l1BlockNumber,
    checkpointNumber,
    rollingHash,
    inboxRollingHash,
    bucketSeq,
    bucketTimestamp,
  };
}
