import { toBufferBE } from '@aztec/foundation/bigint-buffer';
import { BufferReader } from '@aztec/foundation/serialize';

import { TxHash, UnencryptedL2Log } from '../index.js';

/**
 * Represents an individual unencrypted log entry extended with info about the block and tx it was emitted in.
 */
export class ExtendedUnencryptedL2Log {
  constructor(
    /** Number of L2 block the log was emitted in. */
    public readonly blockNumber: number,
    /** Selector of the event/log topic. */
    public readonly txHash: TxHash,
    /** The data contents of the log. */
    public readonly log: UnencryptedL2Log,
  ) {}

  /**
   * Serializes log to a buffer.
   * @returns A buffer containing the serialized log.
   */
  public toBuffer(): Buffer {
    return Buffer.concat([toBufferBE(BigInt(this.blockNumber), 4), this.txHash.buffer, this.log.toBuffer()]);
  }

  /**
   * Deserializes log from a buffer.
   * @param buffer - The buffer or buffer reader containing the log.
   * @returns Deserialized instance of `Log`.
   */
  public static fromBuffer(buffer: Buffer | BufferReader): ExtendedUnencryptedL2Log {
    const reader = BufferReader.asReader(buffer);

    const blockNumber = reader.readNumber();
    const txHash = new TxHash(reader.readBytes(TxHash.SIZE));
    const log = UnencryptedL2Log.fromBuffer(reader);

    return new ExtendedUnencryptedL2Log(blockNumber, txHash, log);
  }
}
