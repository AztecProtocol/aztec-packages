import { Fr } from '@aztec/foundation/curves/bn254';
import type { ZodFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

import { z } from 'zod';

import type { InboxMessagePosition } from './l1_to_l2_message_source.js';

/**
 * Signed reference to the ordered Inbox message prefix a block consumed through: the consensus rolling hash over the
 * first `n` messages, where `n` is the L1-to-L2 tree leaf count the block's signed header commits to in
 * `state.l1ToL2MessageTree.nextAvailableLeafIndex`. The pair (count, hash) authenticates exactly which messages the
 * block inserted, because every message's rolling hash chains the one before it, so a validator holding the same
 * prefix hash at that count holds the same leaves.
 *
 * The position need not be a boundary of the bucket partition L1 currently holds: intermediate blocks may end at any
 * message prefix, and an L1 reorg that re-mines the same messages under different bucket boundaries leaves every
 * prefix hash intact. Only a completed checkpoint's final position must resolve to a live L1 bucket, which is what
 * the checkpoint header's `inboxRollingHash` (equal to the last block's reference) is checked against at publication.
 * A wrong reference can only fail the validator's local check; the checkpoint header remains the signed consensus
 * commitment.
 */
export class InboxMessagePrefixRef {
  constructor(
    /** Consensus rolling hash (truncated sha256 chain) over the consumed message prefix; zero for an empty prefix. */
    public readonly inboxRollingHash: Fr,
  ) {}

  /** Serialized size in bytes: one field element. */
  static readonly SIZE = Fr.SIZE_IN_BYTES;

  static get schema(): ZodFor<InboxMessagePrefixRef> {
    return z.object({ inboxRollingHash: Fr.schema }).transform(InboxMessagePrefixRef.from);
  }

  static from(fields: FieldsOf<InboxMessagePrefixRef>): InboxMessagePrefixRef {
    return new InboxMessagePrefixRef(fields.inboxRollingHash);
  }

  /** The reference naming the prefix a message position ends: its rolling hash. */
  static fromPosition(position: InboxMessagePosition): InboxMessagePrefixRef {
    return new InboxMessagePrefixRef(position.rollingHash);
  }

  toBuffer(): Buffer {
    return serializeToBuffer([this.inboxRollingHash]);
  }

  static fromBuffer(buffer: Buffer | BufferReader): InboxMessagePrefixRef {
    const reader = BufferReader.asReader(buffer);
    return new InboxMessagePrefixRef(reader.readObject(Fr));
  }

  getSize(): number {
    return InboxMessagePrefixRef.SIZE;
  }

  equals(other: InboxMessagePrefixRef): boolean {
    return this.inboxRollingHash.equals(other.inboxRollingHash);
  }

  /** The reference of the empty prefix, which every chain starts from. */
  static empty(): InboxMessagePrefixRef {
    return new InboxMessagePrefixRef(Fr.ZERO);
  }

  static random(): InboxMessagePrefixRef {
    return new InboxMessagePrefixRef(Fr.random());
  }

  toInspect() {
    return { inboxRollingHash: this.inboxRollingHash.toString() };
  }
}
