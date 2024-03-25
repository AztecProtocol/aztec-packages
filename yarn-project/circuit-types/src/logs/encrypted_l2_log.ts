import { randomBytes } from '@aztec/foundation/crypto';
import { BufferReader } from '@aztec/foundation/serialize';

/**
 * Represents an individual encrypted log entry.
 */
export class EncryptedL2Log {
  constructor(
    /** The encrypted data contents of the log. */
    public readonly data: Buffer,
  ) {}

  get length(): number {
    return this.data.length;
  }

  /**
   * Serializes log to a buffer.
   * @returns A buffer containing the serialized log.
   */
  public toBuffer(): Buffer {
    return this.data;
  }

  /** Returns a JSON-friendly representation of the log. */
  public toJSON(): object {
    return {
      data: this.data.toString('hex'),
    };
  }

  /** Converts a plain JSON object into an instance. */
  public static fromJSON(obj: any) {
    return new EncryptedL2Log(Buffer.from(obj.data, 'hex'));
  }

  /**
   * Deserializes log from a buffer.
   * @param buffer - The buffer or buffer reader containing the log.
   * @returns Deserialized instance of `Log`.
   */
  public static fromBuffer(buffer: Buffer | BufferReader): EncryptedL2Log {
    const reader = BufferReader.asReader(buffer);
    const data = reader.readBuffer();
    return new EncryptedL2Log(data);
  }

  /**
   * Crates a random log.
   * @returns A random log.
   */
  public static random(): EncryptedL2Log {
    const dataLength = randomBytes(1)[0];
    const data = randomBytes(dataLength);
    return new EncryptedL2Log(data);
  }

  public static empty() {
    return new EncryptedL2Log(Buffer.alloc(0));
  }
}
