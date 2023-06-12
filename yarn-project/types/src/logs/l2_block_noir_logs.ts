import { BufferReader, serializeBufferToVector } from '@aztec/foundation/serialize';
import { TxNoirLogs } from './tx_noir_logs.js';

/**
 * Data container of logs emitted in all txs in a given L2 block.
 */
export class L2BlockNoirLogs {
  constructor(
    /**
     * An array containing logs emitted in individual function invocations in this tx.
     */
    public readonly txLogs: TxNoirLogs[],
  ) {}

  /**
   * Serializes logs into a buffer.
   * @returns A buffer containing the serialized logs.
   */
  public toBuffer(): Buffer {
    const serializedTxLogs = this.txLogs.map(logs => logs.toBuffer());
    // Concatenate all serialized function logs into a single buffer and prefix it with 4 bytes for its total length.
    return serializeBufferToVector(Buffer.concat(serializedTxLogs));
  }

  /**
   * Get the total length of serialized data.
   * @returns Total length of serialized data.
   */
  public getSerializedLength(): number {
    return this.txLogs.reduce((acc, logs) => acc + logs.getSerializedLength(), 0) + 4;
  }

  /**
   * Deserializes logs from a buffer.
   * @param buf - The buffer containing the serialized logs.
   * @returns A new `L2BlockNoirLogs` object.
   */
  public static fromBuffer(buf: Buffer): L2BlockNoirLogs {
    // Skip the first 4 bytes for the total length (included because it's needed in `Decoder.sol`)
    const reader = new BufferReader(buf, 4);

    const serializedTxLogs = reader.readBufferArray();
    const txLogs = serializedTxLogs.map(logs => TxNoirLogs.fromBuffer(logs, false));
    return new L2BlockNoirLogs(txLogs);
  }

  /**
   * Creates a new `L2BlockNoirLogs` object with `numFunctionInvocations` function logs and `numLogsIn1Invocation` logs
   * in each invocation.
   * @param numTxs - The number of txs in the block.
   * @param numFunctionInvocations - The number of function invocations in the tx.
   * @param numLogsIn1Invocation - The number of logs emitted in each function invocation.
   * @returns A new `L2BlockNoirLogs` object.
   */
  public static random(numTxs: number, numFunctionInvocations: number, numLogsIn1Invocation: number): L2BlockNoirLogs {
    const txLogs: TxNoirLogs[] = [];
    for (let i = 0; i < numTxs; i++) {
      txLogs.push(TxNoirLogs.random(numFunctionInvocations, numLogsIn1Invocation));
    }
    return new L2BlockNoirLogs(txLogs);
  }
}
