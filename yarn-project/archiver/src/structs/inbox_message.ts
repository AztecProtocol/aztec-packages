import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, bigintToUInt64BE, serializeToBuffer } from '@aztec/foundation/serialize';

/**
 * An L1-to-L2 message as the archiver stores it: one row of the ordered Inbox message log. The compact index and the
 * rolling hash chain are the message's identity within the sequence; the L1 block is only a hint for finding the
 * message's event again after an L1 reorg.
 */
export type InboxMessage = {
  /** Compact global insertion index of the message in the Inbox: its leaf index in the L1-to-L2 message tree. */
  index: bigint;
  leaf: Fr;
  /** L1 block the message's event was observed in. A recovery search hint, not part of the message's identity. */
  l1BlockNumber: bigint;
  /** Consensus rolling hash (truncated sha256 chain) of all messages up to and including this one. */
  inboxRollingHash: Fr;
};

export function serializeInboxMessage(message: InboxMessage): Buffer {
  return serializeToBuffer([
    bigintToUInt64BE(message.index),
    message.leaf,
    bigintToUInt64BE(message.l1BlockNumber),
    message.inboxRollingHash,
  ]);
}

export function deserializeInboxMessage(buffer: Buffer): InboxMessage {
  const reader = BufferReader.asReader(buffer);
  const index = reader.readUInt64();
  const leaf = reader.readObject(Fr);
  const l1BlockNumber = reader.readUInt64();
  const inboxRollingHash = reader.readObject(Fr);
  return { index, leaf, l1BlockNumber, inboxRollingHash };
}
