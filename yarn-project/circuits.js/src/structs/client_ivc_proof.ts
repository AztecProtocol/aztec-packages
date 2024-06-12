import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

/**
 * LONDONTODO(AD): this will eventually replace RecursiveProof as the primary proof
 * attached to a transaction. This was created as a means to isolate just what we need from the
 *
 * LONDONTODO think about this type harder
 * LONDONTODO eventually we will read all these VKs from the data tree instead of passing them
 */
export class ClientIvcProof {
  constructor(
    public instVkBuffer: Buffer,
    public pgAccBuffer: Buffer,
    public clientIvcProofBuffer: Buffer,
    public translatorVkBuffer: Buffer,
    public eccVkBuffer: Buffer
  ) { }

  public isEmpty() {
    return this.clientIvcProofBuffer.length === 0;
  }

  static empty() {
    return new ClientIvcProof(Buffer.from(''), Buffer.from(''), Buffer.from(''), Buffer.from(''), Buffer.from(''))
  }

  static fromBuffer(
    buffer: Buffer | BufferReader,
  ): ClientIvcProof {
    const reader = BufferReader.asReader(buffer);
    return new ClientIvcProof(reader.readBuffer(), reader.readBuffer(), reader.readBuffer(), reader.readBuffer(), reader.readBuffer());
  }

  public toBuffer() {
    return serializeToBuffer(this.instVkBuffer, this.pgAccBuffer, this.clientIvcProofBuffer, this.translatorVkBuffer, this.eccVkBuffer);
  }
}