import { MAX_CONTRACT_CLASS_LOGS_PER_CALL } from '@aztec/circuits.js';
import { sha256Trunc } from '@aztec/foundation/crypto';
import { BufferReader, prefixBufferWithLength } from '@aztec/foundation/serialize';

import { z } from 'zod';

import { UnencryptedL2Log } from './unencrypted_l2_log.js';

/**
 * Data container of logs emitted in 1 function invocation (corresponds to 1 kernel iteration).
 */
export class UnencryptedFunctionL2Logs {
  constructor(
    /** An array of logs. */
    public readonly logs: UnencryptedL2Log[],
  ) {}

  /**
   * Serializes all function logs into a buffer.
   * @returns A buffer containing the serialized logs.
   * @remarks Each log is prefixed with 4 bytes for its length, then all the serialized logs are concatenated and
   *          the resulting buffer is prefixed with 4 bytes for its total length.
   */
  public toBuffer(): Buffer {
    const serializedLogs = this.logs.map(log => prefixBufferWithLength(log.toBuffer()));
    return prefixBufferWithLength(Buffer.concat(serializedLogs));
  }

  /**
   * Get the total length of all serialized data
   * @returns Total length of serialized data.
   */
  public getSerializedLength(): number {
    // adding 4 for the resulting buffer length.
    return this.getKernelLength() + 4;
  }

  /**
   * Get the total length of all chargable data (raw log data + 4 for each log)
   * TODO: Rename this? getChargableLength? getDALength?
   * @returns Total length of data.
   */
  public getKernelLength(): number {
    // Adding 4 to each log's length to account for the size stored in the serialized buffer
    return this.logs.reduce((acc, log) => acc + log.length + 4, 0);
  }

  /**
   * Calculates hash of serialized logs.
   * @returns Buffer containing 248 bits of information of sha256 hash.
   */
  public hash(): Buffer {
    // Truncated SHA hash of the concatenation of the hash of each inner log
    // Changed in resolving #5017 to mimic logs hashing in kernels
    const preimage = Buffer.concat(this.logs.map(l => l.hash()));
    return sha256Trunc(preimage);
  }

  static get schema() {
    return z
      .object({ logs: z.array(UnencryptedL2Log.schema) })
      .transform(({ logs }) => new UnencryptedFunctionL2Logs(logs));
  }

  /**
   * Creates an empty L2Logs object with no logs.
   * @returns A new FunctionL2Logs object with no logs.
   */
  public static empty(): UnencryptedFunctionL2Logs {
    return new UnencryptedFunctionL2Logs([]);
  }

  /**
   * Deserializes logs from a buffer.
   * @param buf - The buffer containing the serialized logs.
   * @param isLengthPrefixed - Whether the buffer is prefixed with 4 bytes for its total length.
   * @returns Deserialized instance of `FunctionL2Logs`.
   */
  public static fromBuffer(buf: Buffer, isLengthPrefixed = true): UnencryptedFunctionL2Logs {
    const reader = new BufferReader(buf, 0);

    // If the buffer is length prefixed use the length to read the array. Otherwise, the entire buffer is consumed.
    const logsBufLength = isLengthPrefixed ? reader.readNumber() : -1;
    const logs = reader.readBufferArray(logsBufLength);

    return new UnencryptedFunctionL2Logs(logs.map(UnencryptedL2Log.fromBuffer));
  }

  /**
   * Creates a new L2Logs object with `numLogs` logs.
   * @param numLogs - The number of logs to create.
   * @returns A new UnencryptedFunctionL2Logs object.
   */
  public static async random(numLogs: number): Promise<UnencryptedFunctionL2Logs> {
    if (numLogs > MAX_CONTRACT_CLASS_LOGS_PER_CALL) {
      throw new Error(`Trying to create ${numLogs} logs for one call (max: ${MAX_CONTRACT_CLASS_LOGS_PER_CALL})`);
    }
    const logs: UnencryptedL2Log[] = [];
    for (let i = 0; i < numLogs; i++) {
      logs.push(await UnencryptedL2Log.random());
    }
    return new UnencryptedFunctionL2Logs(logs);
  }
}
