import { INBOX_PARITY_SIZE_LARGE, INBOX_PARITY_SIZE_MEDIUM, INBOX_PARITY_SIZE_SMALL } from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

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
    /** Number of real (non-padding) messages in `messages`. */
    public readonly numMessages: number,
    /** Inbox rolling hash before this checkpoint's messages (the previous checkpoint's end; genesis is zero). */
    public readonly startRollingHash: Fr,
    /** Root of the VK tree. */
    public readonly vkTreeRoot: Fr,
    /** Prover identity committed to by the circuit, for sybil protection. */
    public readonly proverId: Fr,
  ) {
    if (messages.length !== size) {
      throw new Error(`InboxParity messages length (${messages.length}) must equal size (${size})`);
    }
  }

  /**
   * Builds the inputs from a checkpoint's real messages, sizing the circuit by the message count and padding the
   * message array out to that size.
   */
  static fromMessages(
    messages: Fr[],
    startRollingHash: Fr,
    vkTreeRoot: Fr,
    proverId: Fr,
  ): InboxParityPrivateInputs {
    const size = pickInboxParitySize(messages.length);
    // Explicit `<Fr, number>` keeps the result `Fr[]`; padding to the union-literal `size` would infer a deep tuple.
    return new InboxParityPrivateInputs(
      size,
      padArrayEnd<Fr, number>(messages, Fr.ZERO, size),
      messages.length,
      startRollingHash,
      vkTreeRoot,
      proverId,
    );
  }

  /** Serializes the inputs to a buffer. */
  toBuffer() {
    return serializeToBuffer(
      new Fr(this.size),
      this.messages,
      new Fr(this.numMessages),
      this.startRollingHash,
      this.vkTreeRoot,
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
    return new InboxParityPrivateInputs(
      size,
      messages,
      Fr.fromBuffer(reader).toNumber(),
      Fr.fromBuffer(reader),
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
