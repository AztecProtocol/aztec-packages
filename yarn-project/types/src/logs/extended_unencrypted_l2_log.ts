import { toBufferBE } from '@aztec/foundation/bigint-buffer';
import { BufferReader } from '@aztec/foundation/serialize';

import isEqual from 'lodash.isequal';

import { LogId, PXE, TxHash, UnencryptedL2Log } from '../index.js';

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
   * Serializes log to a string.
   * @returns A string containing the serialized log.
   */
  public toString(): string {
    return this.toBuffer().toString('hex');
  }

  /**
   * Serializes log to a human readable string.
   * @returns A human readable representation of the log.
   */
  public toHumanReadable(): string {
    return `${this.log.toHumanReadable()} (blockNumber: ${this.blockNumber}, txHash: ${this.txHash.toString()})`;
  }

  /**
   * Checks if two ExtendedUnencryptedL2Log objects are equal.
   * @param other - Another ExtendedUnencryptedL2Log object to compare with.
   * @returns True if the two objects are equal, false otherwise.
   */
  public equals(other: ExtendedUnencryptedL2Log): boolean {
    return isEqual(this, other);
  }

  /**
   * Gets a globally unique log id.
   * @param pxe - The PXE instance to use for retrieving logs.
   * @returns A globally unique log id.
   */
  public async getLogId(pxe: PXE): Promise<LogId> {
    const txLogs = await pxe.getUnencryptedLogs({ txHash: this.txHash });
    const logIndex = txLogs.findIndex(log => log.equals(this));
    if (logIndex === -1) {
      throw new Error(`Log ${this.toHumanReadable()} not found in tx ${this.txHash.toString()}`);
    }
    return {
      blockNumber: this.blockNumber,
      txIndex: this.txHash,
      logIndex: logIndex,
    };
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

  /**
   * Deserializes `ExtendedUnencryptedL2Log` object from a hex string representation.
   * @param data - A hex string representation of the log.
   * @returns An `ExtendedUnencryptedL2Log` object.
   */
  public static fromString(data: string): ExtendedUnencryptedL2Log {
    const buffer = Buffer.from(data, 'hex');
    return ExtendedUnencryptedL2Log.fromBuffer(buffer);
  }
}
