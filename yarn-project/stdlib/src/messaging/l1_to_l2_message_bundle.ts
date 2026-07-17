import { MAX_L1_TO_L2_MSGS_PER_BLOCK } from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

/**
 * A block's L1-to-L2 message bundle: the leaves it inserts into the L1-to-L2 message tree plus the two counts a block
 * root needs — one for the (transitionally padded) tree insert, one for the real-count sponge absorb. See the Noir
 * `L1ToL2MessageBundle`. Once the tree insert becomes real-count too, `numMsgs === numRealMsgs` and `numRealMsgs` is
 * dropped.
 */
export class L1ToL2MessageBundle {
  constructor(
    /** The message leaves, padded with zeros to `MAX_L1_TO_L2_MSGS_PER_BLOCK`. Kept as a plain array (not a tuple)
     * to avoid TS's deep-instantiation limit on the 1024-lane type. */
    public readonly messages: Fr[],
    /** Number of leaves inserted into the L1-to-L2 message tree (the padded subtree size, or 0 for an empty block). */
    public readonly numMsgs: number,
    /** Number of real (non-padding) messages absorbed into the message sponge. */
    public readonly numRealMsgs: number,
  ) {}

  /** An empty bundle: no leaves inserted, nothing absorbed. */
  static empty(): L1ToL2MessageBundle {
    return new L1ToL2MessageBundle(
      Array.from({ length: MAX_L1_TO_L2_MSGS_PER_BLOCK }, () => Fr.ZERO),
      0,
      0,
    );
  }

  toBuffer() {
    return serializeToBuffer(this.messages, this.numMsgs, this.numRealMsgs);
  }

  toString() {
    return bufferToHex(this.toBuffer());
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    // Array.from (not readArray with the literal cap) keeps the type `Fr[]` and avoids TS's deep-tuple instantiation.
    const messages = Array.from({ length: MAX_L1_TO_L2_MSGS_PER_BLOCK }, () => Fr.fromBuffer(reader));
    return new L1ToL2MessageBundle(messages, reader.readNumber(), reader.readNumber());
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

/** Pads `messages` to a full subtree and wraps it into a bundle whose tree-insert count is the padded subtree size. */
export function makeL1ToL2MessageBundle(messages: Fr[]): L1ToL2MessageBundle {
  // Explicit `<Fr, number>` keeps the result `Fr[]`; padding to the literal cap would otherwise infer a deep tuple.
  return new L1ToL2MessageBundle(
    padArrayEnd<Fr, number>(messages, Fr.ZERO, MAX_L1_TO_L2_MSGS_PER_BLOCK),
    MAX_L1_TO_L2_MSGS_PER_BLOCK,
    messages.length,
  );
}
