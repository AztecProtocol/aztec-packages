import { Buffer16, Buffer32 } from '@aztec/foundation/buffer';
import { keccak256 } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, bigintToUInt64BE, numToUInt32BE, serializeToBuffer } from '@aztec/foundation/serialize';

export type InboxMessage = {
  index: bigint;
  leaf: Fr;
  l2BlockNumber: bigint;
  l1BlockNumber: bigint;
  l1BlockHash: Buffer32;
  rollingHash: Buffer16;
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
    numToUInt32BE(Number(message.l1BlockNumber)),
    numToUInt32BE(Number(message.l2BlockNumber)),
    message.rollingHash,
  ]);
}

export function deserializeInboxMessage(buffer: Buffer): InboxMessage {
  const reader = BufferReader.asReader(buffer);
  const index = reader.readUInt64();
  const leaf = reader.readObject(Fr);
  const l1BlockHash = reader.readObject(Buffer32);
  const l1BlockNumber = BigInt(reader.readNumber());
  const l2BlockNumber = BigInt(reader.readNumber());
  const rollingHash = reader.readObject(Buffer16);
  return { index, leaf, l1BlockHash, l1BlockNumber, l2BlockNumber, rollingHash };
}
