import { BufferReader } from '@aztec/foundation/serialize';
import { serializeToBuffer } from '../utils/serialize.js';

export class Proof {
  // Make sure this type is not confused with other buffer wrappers
  readonly __proofBrand: any;
  constructor(public buffer: Buffer) {}

  // Interpreted differently for proof than fromBuffer
  static fromMsgpackBuffer(buffer: Buffer) {
    return new Proof(buffer);
  }
  static fromBuffer(buffer: Buffer | BufferReader): Proof {
    const reader = BufferReader.asReader(buffer);
    const size = reader.readNumber();
    const buf = reader.readBytes(size);
    return new Proof(buf);
  }
  // Interpreted differently for proof than toBuffer
  public toMsgpackBuffer() {
    return this.buffer;
  }
  public toBuffer() {
    return serializeToBuffer(this.buffer.length, this.buffer);
  }
}
