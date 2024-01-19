import { BufferReader, prefixBufferWithLength } from '@aztec/foundation/serialize';

import { FunctionL2Logs } from './function_l2_logs.js';
import { LogType } from './log_type.js';

/**
 * Data container of logs emitted in 1 tx.
 */
export class TxL2Logs {
  constructor(
    /**
     * An array containing logs emitted in individual function invocations in this tx.
     */
    public readonly functionLogs: FunctionL2Logs[],
  ) {}

  /**
   * Serializes logs into a buffer.
   * @returns A buffer containing the serialized logs.
   */
  public toBuffer(): Buffer {
    const serializedFunctionLogs = this.functionLogs.map(logs => logs.toBuffer());
    // Concatenate all serialized function logs into a single buffer and prefix it with 4 bytes for its total length.
    return prefixBufferWithLength(Buffer.concat(serializedFunctionLogs));
  }

  /**
   * Get the total length of serialized data.
   * @returns Total length of serialized data.
   */
  public getSerializedLength(): number {
    return this.functionLogs.reduce((acc, logs) => acc + logs.getSerializedLength(), 0) + 4;
  }

  /** Gets the total number of logs. */
  public getTotalLogCount() {
    return this.functionLogs.reduce((acc, logs) => acc + logs.logs.length, 0);
  }

  /**
   * Adds function logs to the existing logs.
   * @param functionLogs - The function logs to add
   * @remarks Used by sequencer to append unencrypted logs emitted in public function calls.
   */
  public addFunctionLogs(functionLogs: FunctionL2Logs[]) {
    this.functionLogs.push(...functionLogs);
  }

  /**
   * Deserializes logs from a buffer.
   * @param buf - The buffer containing the serialized logs.
   * @param isLengthPrefixed - Whether the buffer is prefixed with 4 bytes for its total length.
   * @returns A new L2Logs object.
   */
  public static fromBuffer(buf: Buffer | BufferReader, isLengthPrefixed = true): TxL2Logs {
    const reader = BufferReader.asReader(buf);

    // If the buffer is length prefixed use the length to read the array. Otherwise, the entire buffer is consumed.
    const logsBufLength = isLengthPrefixed ? reader.readNumber() : -1;
    const serializedFunctionLogs = reader.readBufferArray(logsBufLength);

    const functionLogs = serializedFunctionLogs.map(logs => FunctionL2Logs.fromBuffer(logs, false));
    return new TxL2Logs(functionLogs);
  }

  /**
   * Creates a new `TxL2Logs` object with `numCalls` function logs and `numLogsPerCall` logs in each invocation.
   * @param numCalls - The number of function calls in the tx.
   * @param numLogsPerCall - The number of logs emitted in each function call.
   * @param logType - The type of logs to generate.
   * @returns A new `TxL2Logs` object.
   */
  public static random(numCalls: number, numLogsPerCall: number, logType = LogType.ENCRYPTED): TxL2Logs {
    const functionLogs: FunctionL2Logs[] = [];
    for (let i = 0; i < numCalls; i++) {
      functionLogs.push(FunctionL2Logs.random(numLogsPerCall, logType));
    }
    return new TxL2Logs(functionLogs);
  }

  /**
   * Convert a TxL2Logs class object to a plain JSON object.
   * @returns A plain object with TxL2Logs properties.
   */
  public toJSON() {
    return {
      functionLogs: this.functionLogs.map(log => log.toJSON()),
    };
  }

  /**
   * Unrolls logs from this tx.
   * @returns Unrolled logs.
   */
  public unrollLogs(): Buffer[] {
    return this.functionLogs.flatMap(functionLog => functionLog.logs);
  }

  /**
   * Convert a plain JSON object to a TxL2Logs class object.
   * @param obj - A plain TxL2Logs JSON object.
   * @returns A TxL2Logs class object.
   */
  public static fromJSON(obj: any) {
    const functionLogs = obj.functionLogs.map((log: any) => FunctionL2Logs.fromJSON(log));
    return new TxL2Logs(functionLogs);
  }
}
