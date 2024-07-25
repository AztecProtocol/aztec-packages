import { BufferReader, serializeToBuffer } from "../serialize/index.js";

// Temp wrapper for p2p serde
export class Signature {
    constructor(public readonly signature: Buffer) {}


  toBuffer() {
    return serializeToBuffer([this.signature.length, this.signature]);
  }

  static fromBuffer(buffer: Buffer | BufferReader): Signature {
    const reader = BufferReader.asReader(buffer);
    return new Signature(reader.readBuffer());
  }

}