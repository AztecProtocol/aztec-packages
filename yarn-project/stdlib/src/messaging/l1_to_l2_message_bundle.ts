import { MAX_L1_TO_L2_MSGS_PER_BLOCK } from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { type InboxMessageBundle, bucketStartsOf, flattenBundle } from './inbox_message_bundle.js';

/**
 * A block's L1-to-L2 message bundle: the real message leaves it inserts into the L1-to-L2 message tree, which of them
 * open an L1 Inbox bucket, and the count that drives both the compact (unpadded) tree append and the message-sponge
 * absorb. See the Noir `L1ToL2MessageBundle`.
 */
export class L1ToL2MessageBundle {
  constructor(
    /** The real message leaves in the leading lanes, padded with zeros to `MAX_L1_TO_L2_MSGS_PER_BLOCK`. Kept as a
     * plain array (not a tuple) to avoid TS's deep-instantiation limit on the wide type. */
    public readonly messages: Fr[],
    /** Per-lane flag marking the leaves that open an L1 Inbox bucket, padded with `false` alongside `messages`. */
    public readonly bucketStarts: boolean[],
    /** Number of real messages: drives both the compact tree append and the sponge absorb. */
    public readonly numMsgs: number,
  ) {}

  /** An empty bundle: no leaves inserted, nothing absorbed. */
  static empty(): L1ToL2MessageBundle {
    return new L1ToL2MessageBundle(
      Array.from({ length: MAX_L1_TO_L2_MSGS_PER_BLOCK }, () => Fr.ZERO),
      Array.from({ length: MAX_L1_TO_L2_MSGS_PER_BLOCK }, () => false),
      0,
    );
  }

  toBuffer() {
    return serializeToBuffer(this.messages, this.bucketStarts, this.numMsgs);
  }

  toString() {
    return bufferToHex(this.toBuffer());
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    // Array.from (not readArray with the literal cap) keeps the type `Fr[]` and avoids TS's deep-tuple instantiation.
    const messages = Array.from({ length: MAX_L1_TO_L2_MSGS_PER_BLOCK }, () => Fr.fromBuffer(reader));
    const bucketStarts = Array.from({ length: MAX_L1_TO_L2_MSGS_PER_BLOCK }, () => reader.readBoolean());
    return new L1ToL2MessageBundle(messages, bucketStarts, reader.readNumber());
  }

  static fromString(str: string) {
    return L1ToL2MessageBundle.fromBuffer(hexToBuffer(str));
  }

  toJSON() {
    return this.toBuffer();
  }

  static get schema() {
    return bufferSchemaFor(L1ToL2MessageBundle);
  }
}

/**
 * Wraps a block's bucket-grouped messages into a bundle: the leaves fill the leading lanes, each tagged with whether
 * it opens a bucket, and the count is the real count.
 */
export function makeL1ToL2MessageBundle(bundle: InboxMessageBundle): L1ToL2MessageBundle {
  const messages = flattenBundle(bundle);
  // Explicit type arguments keep the results plain arrays; padding to the literal cap would infer a deep tuple.
  return new L1ToL2MessageBundle(
    padArrayEnd<Fr, number>(messages, Fr.ZERO, MAX_L1_TO_L2_MSGS_PER_BLOCK),
    padArrayEnd<boolean, number>(bucketStartsOf(bundle), false, MAX_L1_TO_L2_MSGS_PER_BLOCK),
    messages.length,
  );
}
