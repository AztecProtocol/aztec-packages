import { BufferReader, prefixBufferWithLength } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import isEqual from 'lodash.isequal';
import { z } from 'zod';

import { ContractClassTxL2Logs, type TxL2Logs, UnencryptedTxL2Logs } from './tx_l2_logs.js';
import { type UnencryptedL2Log } from './unencrypted_l2_log.js';

/**
 * Data container of logs emitted in all txs in a given L2 block.
 */
abstract class L2BlockL2Logs {
  constructor(
    /**
     * An array containing logs emitted in individual function invocations in this tx.
     */
    public readonly txLogs: TxL2Logs[],
  ) {}

  /**
   * Serializes logs into a buffer.
   * @returns A buffer containing the serialized logs.
   */
  public toBuffer(): Buffer {
    const serializedTxLogs = this.txLogs.map(logs => logs.toBuffer());
    // Concatenate all serialized function logs into a single buffer and prefix it with 4 bytes for its total length.
    return prefixBufferWithLength(Buffer.concat(serializedTxLogs));
  }

  /**
   * Get the total length of serialized data.
   * @returns Total length of serialized data.
   */
  public getSerializedLength(): number {
    return this.txLogs.reduce((acc, logs) => acc + logs.getSerializedLength(), 0) + 4;
  }

  /**
   * Gets the total number of logs emitted from all the TxL2Logs.
   */
  public getTotalLogCount(): number {
    return this.txLogs.reduce((acc, logs) => acc + logs.getTotalLogCount(), 0);
  }

  /**
   * Seralizes logs into a string.
   * @returns A string representation of the serialized logs.
   */
  public toString(): string {
    return bufferToHex(this.toBuffer());
  }

  /**
   * Checks if two L2BlockL2Logs objects are equal.
   * @param other - Another L2BlockL2Logs object to compare with.
   * @returns True if the two objects are equal, false otherwise.
   */
  public equals(other: L2BlockL2Logs): boolean {
    return isEqual(this, other);
  }

  /**
   * Returns the total number of log entries across an array of L2BlockL2Logs.
   * @param l2BlockL2logs - L2BlockL2Logs to sum over.
   * @returns Total sum of log entries.
   */
  public static getTotalLogCount(l2BlockL2logs: L2BlockL2Logs[]): number {
    return l2BlockL2logs.reduce((sum, log) => sum + log.getTotalLogCount(), 0);
  }
}

export class UnencryptedL2BlockL2Logs extends L2BlockL2Logs {
  static get schema() {
    return z
      .object({ txLogs: z.array(UnencryptedTxL2Logs.schema) })
      .transform(({ txLogs }) => new UnencryptedL2BlockL2Logs(txLogs));
  }

  public get type() {
    return 'Unencrypted';
  }

  /**
   * Deserializes logs from a buffer.
   * @param buffer - The buffer containing the serialized logs.
   * @returns A new `L2BlockL2Logs` object.
   */
  public static fromBuffer(buffer: Buffer | BufferReader): UnencryptedL2BlockL2Logs {
    const reader = BufferReader.asReader(buffer);

    const logsBufLength = reader.readNumber();
    const serializedTxLogs = reader.readBufferArray(logsBufLength);

    const txLogs = serializedTxLogs.map(logs => UnencryptedTxL2Logs.fromBuffer(logs, false));
    return new UnencryptedL2BlockL2Logs(txLogs);
  }

  /**
   * Deserializes logs from a string.
   * @param data - The string containing the serialized logs.
   * @returns A new `L2BlockL2Logs` object.
   */
  public static fromString(data: string): UnencryptedL2BlockL2Logs {
    return UnencryptedL2BlockL2Logs.fromBuffer(hexToBuffer(data));
  }

  /**
   * Creates a new `L2BlockL2Logs` object with `numCalls` function logs and `numLogsPerCall` logs in each function
   * call.
   * @param numTxs - The number of txs in the block.
   * @param numCalls - The number of function calls in the tx.
   * @param numLogsPerCall - The number of logs emitted in each function call.
   * @returns A new `L2BlockL2Logs` object.
   */
  public static random(numTxs: number, numCalls: number, numLogsPerCall: number): UnencryptedL2BlockL2Logs {
    const txLogs: UnencryptedTxL2Logs[] = [];
    for (let i = 0; i < numTxs; i++) {
      txLogs.push(UnencryptedTxL2Logs.random(numCalls, numLogsPerCall));
    }
    return new UnencryptedL2BlockL2Logs(txLogs);
  }

  /**
   * Unrolls logs from a set of blocks.
   * @param blockLogs - Input logs from a set of blocks.
   * @returns Unrolled logs.
   */
  public static unrollLogs(blockLogs: (UnencryptedL2BlockL2Logs | undefined)[]): UnencryptedL2Log[] {
    const logs: UnencryptedL2Log[] = [];
    for (const blockLog of blockLogs) {
      if (blockLog) {
        for (const txLog of blockLog.txLogs) {
          logs.push(...txLog.unrollLogs());
        }
      }
    }
    return logs;
  }
}

export class ContractClass2BlockL2Logs extends L2BlockL2Logs {
  // This class is identical in methods to UnencryptedL2BlockL2Logs, but its
  // consistuent ContractClassTxL2Logs must be treated differently, hence new class.
  static get schema() {
    return z
      .object({ txLogs: z.array(ContractClassTxL2Logs.schema) })
      .transform(({ txLogs }) => new ContractClass2BlockL2Logs(txLogs));
  }

  public get type() {
    return 'ContractClass';
  }

  /**
   * Deserializes logs from a buffer.
   * @param buffer - The buffer containing the serialized logs.
   * @returns A new `L2BlockL2Logs` object.
   */
  public static fromBuffer(buffer: Buffer | BufferReader): ContractClass2BlockL2Logs {
    const reader = BufferReader.asReader(buffer);

    const logsBufLength = reader.readNumber();
    const serializedTxLogs = reader.readBufferArray(logsBufLength);

    const txLogs = serializedTxLogs.map(logs => ContractClassTxL2Logs.fromBuffer(logs, false));
    return new ContractClass2BlockL2Logs(txLogs);
  }

  /**
   * Deserializes logs from a string.
   * @param data - The string containing the serialized logs.
   * @returns A new `L2BlockL2Logs` object.
   */
  public static fromString(data: string): ContractClass2BlockL2Logs {
    return ContractClass2BlockL2Logs.fromBuffer(hexToBuffer(data));
  }

  /**
   * Creates a new `L2BlockL2Logs` object with `numCalls` function logs and `numLogsPerCall` logs in each function
   * call.
   * @param numTxs - The number of txs in the block.
   * @param numCalls - The number of function calls in the tx.
   * @param numLogsPerCall - The number of logs emitted in each function call.
   * @returns A new `L2BlockL2Logs` object.
   */
  public static random(numTxs: number, numCalls: number, numLogsPerCall: number): ContractClass2BlockL2Logs {
    const txLogs: ContractClassTxL2Logs[] = [];
    for (let i = 0; i < numTxs; i++) {
      txLogs.push(ContractClassTxL2Logs.random(numCalls, numLogsPerCall));
    }
    return new ContractClass2BlockL2Logs(txLogs);
  }

  /**
   * Unrolls logs from a set of blocks.
   * @param blockLogs - Input logs from a set of blocks.
   * @returns Unrolled logs.
   */
  public static unrollLogs(blockLogs: (ContractClass2BlockL2Logs | undefined)[]): UnencryptedL2Log[] {
    const logs: UnencryptedL2Log[] = [];
    for (const blockLog of blockLogs) {
      if (blockLog) {
        for (const txLog of blockLog.txLogs) {
          logs.push(...txLog.unrollLogs());
        }
      }
    }
    return logs;
  }
}
