import { BufferReader, serializeBufferToVector } from '@aztec/foundation/serialize';
import { randomBytes } from 'crypto';

/**
 * Data container of logs emitted in 1 function invocation (corresponds to 1 kernel iteration).
 */
export class FunctionNoirLogs {
  constructor(
    /**
     * An array of logs.
     */
    public readonly logs: Buffer[],
  ) {}

  /**
   * Serializes all function logs into a buffer.
   * @returns A buffer containing the serialized logs.
   * @remarks Each log is prefixed with 4 bytes for its length, then all the serialized logs are concatenated and
   *          the resulting buffer is prefixed with 4 bytes for its total length.
   */
  public toBuffer(): Buffer {
    const serializedLogs = this.logs.map(buffer => serializeBufferToVector(buffer));
    return serializeBufferToVector(Buffer.concat(serializedLogs));
  }

  /**
   * Get the total length of all serialized data
   * @returns Total length of serialized data.
   */
  public getSerializedLength(): number {
    // Adding 4 to each log's length to account for the size stored in the serialized buffer and then one more time
    // adding 4 for the resulting buffer length.
    return this.logs.reduce((acc, log) => acc + log.length + 4, 0) + 4;
  }

  /**
   * Deserializes logs from a buffer.
   * @param buf - The buffer containing the serialized logs.
   * @returns Deserialized instance of `FunctionNoirLogs`.
   */
  public static fromBuffer(buf: Buffer): FunctionNoirLogs {
    // Skip the first 4 bytes for the total length (included because it's needed in `Decoder.sol`)
    const reader = new BufferReader(buf, 4);

    const logs = reader.readBufferArray();
    return new FunctionNoirLogs(logs);
  }

  /**
   * Creates a new NoirLogs object with `numLogs` logs.
   * @param numLogs - The number of logs to create.
   * @returns A new FunctionNoirLogs object.
   */
  public static random(numLogs: number): FunctionNoirLogs {
    const logs: Buffer[] = [];
    for (let i = 0; i < numLogs; i++) {
      logs.push(randomBytes(144));
    }
    return new FunctionNoirLogs(logs);
  }
}
