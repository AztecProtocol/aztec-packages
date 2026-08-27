import { INBOX_PARITY_SIZE_LARGE, INBOX_PARITY_SIZE_MEDIUM, INBOX_PARITY_SIZE_SMALL } from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, bigintToUInt64BE, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import {
  type InboxMessageBundle,
  bucketStartsOf,
  bucketTimestampsOf,
  flattenBundle,
} from '../messaging/inbox_message_bundle.js';

/** The InboxParity size ladder, ascending. One VK per size; the prover proves the smallest that fits. */
export const INBOX_PARITY_SIZES = [INBOX_PARITY_SIZE_SMALL, INBOX_PARITY_SIZE_MEDIUM, INBOX_PARITY_SIZE_LARGE] as const;

/** A valid InboxParity ladder size. */
export type InboxParitySize = (typeof INBOX_PARITY_SIZES)[number];

/**
 * Picks the smallest ladder size that can hold `numMessages` messages.
 * @throws if `numMessages` exceeds the largest rung.
 */
export function pickInboxParitySize(numMessages: number): InboxParitySize {
  const size = INBOX_PARITY_SIZES.find(s => numMessages <= s);
  if (size === undefined) {
    throw new Error(
      `Cannot fit ${numMessages} L1-to-L2 messages into any InboxParity size (max ${INBOX_PARITY_SIZE_LARGE})`,
    );
  }
  return size;
}

/**
 * Private inputs for one `InboxParity<S>` proof (S = `size`). The prover produces exactly one per checkpoint, sized
 * by the checkpoint's message count via {@link pickInboxParitySize}.
 */
export class InboxParityPrivateInputs {
  constructor(
    /** Ladder size S: the length of `messages` and the circuit variant to prove ({@link INBOX_PARITY_SIZES}). */
    public readonly size: InboxParitySize,
    /** The checkpoint's L1-to-L2 messages, padded with zeros to `size`; the first `numMessages` are real. */
    public readonly messages: Fr[],
    /**
     * Flags the messages that are the first of their L1 Inbox bucket, so the rolling hash commits to the bucket
     * boundaries. Aligned with `messages` and padded with `false` to `size`.
     */
    public readonly bucketStarts: boolean[],
    /**
     * L1 timestamp of the bucket each message belongs to, so the rolling hash commits to when L1 opened each bucket.
     * Aligned with `messages` and padded with zero to `size`.
     */
    public readonly bucketTimestamps: bigint[],
    /** Number of real (non-padding) messages in `messages`. */
    public readonly numMessages: number,
    /** Inbox rolling hash before this checkpoint's messages (the previous checkpoint's end; genesis is zero). */
    public readonly startRollingHash: Fr,
    /** Prover identity committed to by the circuit, for sybil protection. */
    public readonly proverId: Fr,
  ) {
    if (messages.length !== size) {
      throw new Error(`InboxParity messages length (${messages.length}) must equal size (${size})`);
    }
    if (bucketStarts.length !== size) {
      throw new Error(`InboxParity bucketStarts length (${bucketStarts.length}) must equal size (${size})`);
    }
    if (bucketTimestamps.length !== size) {
      throw new Error(`InboxParity bucketTimestamps length (${bucketTimestamps.length}) must equal size (${size})`);
    }
  }

  /**
   * Builds the inputs from a checkpoint's message bundle, sizing the circuit by the message count and padding the
   * message, flag and timestamp arrays out to that size. This is the only place the per-bucket grouping is turned
   * into the flat leaves, bucket-start flags and per-lane bucket timestamps the circuit takes.
   */
  static fromMessages(bundle: InboxMessageBundle, startRollingHash: Fr, proverId: Fr): InboxParityPrivateInputs {
    const messages = flattenBundle(bundle);
    const bucketStarts = bucketStartsOf(bundle);
    const bucketTimestamps = bucketTimestampsOf(bundle);
    const size = pickInboxParitySize(messages.length);
    // Explicit `<Fr, number>` keeps the result `Fr[]`; padding to the union-literal `size` would infer a deep tuple.
    return new InboxParityPrivateInputs(
      size,
      padArrayEnd<Fr, number>(messages, Fr.ZERO, size),
      padArrayEnd<boolean, number>(bucketStarts, false, size),
      padArrayEnd<bigint, number>(bucketTimestamps, 0n, size),
      messages.length,
      startRollingHash,
      proverId,
    );
  }

  /** Serializes the inputs to a buffer. */
  toBuffer() {
    return serializeToBuffer(
      new Fr(this.size),
      this.messages,
      this.bucketStarts,
      this.bucketTimestamps.map(timestamp => bigintToUInt64BE(timestamp)),
      new Fr(this.numMessages),
      this.startRollingHash,
      this.proverId,
    );
  }

  /** Serializes the inputs to a hex string. */
  toString() {
    return bufferToHex(this.toBuffer());
  }

  /**
   * Deserializes the inputs from a buffer.
   * @param buffer - The buffer to deserialize from.
   */
  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    const size = Fr.fromBuffer(reader).toNumber() as InboxParitySize;
    // Array.from keeps the type `Fr[]`; readArray with the union-literal `size` would infer a deep tuple.
    const messages = Array.from({ length: size }, () => Fr.fromBuffer(reader));
    const bucketStarts = Array.from({ length: size }, () => reader.readBoolean());
    const bucketTimestamps = Array.from({ length: size }, () => reader.readUInt64());
    return new InboxParityPrivateInputs(
      size,
      messages,
      bucketStarts,
      bucketTimestamps,
      Fr.fromBuffer(reader).toNumber(),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
    );
  }

  /**
   * Deserializes the inputs from a hex string.
   * @param str - The hex string to deserialize from.
   */
  static fromString(str: string) {
    return InboxParityPrivateInputs.fromBuffer(hexToBuffer(str));
  }

  /** Returns a buffer representation for JSON serialization. */
  toJSON() {
    return this.toBuffer();
  }

  static get schema() {
    return bufferSchemaFor(InboxParityPrivateInputs);
  }
}
