import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

/**
 * TODO(https://github.com/AztecProtocol/aztec-packages/issues/7370) refactory this to
 * eventually we read all these VKs from the data tree instead of passing them
 */
export class ClientIvcProof {
  constructor(
    // produced by the sequencer when making the tube proof
    // TODO(https://github.com/AztecProtocol/aztec-packages/issues/7370): Need to precompute private kernel tail VK so we can verify this immediately in the tx pool
    // which parts of these are needed to quickly verify that we have a correct IVC proof
    public clientIvcProofBuffer: Buffer,
    public clientIvcVkBuffer: Buffer,
  ) {}

  public isEmpty() {
    return this.clientIvcProofBuffer.length === 0;
  }

  static empty() {
    return new ClientIvcProof(Buffer.from(''), Buffer.from(''));
  }

  static fake(fill = Math.floor(Math.random() * 255)) {
    return new ClientIvcProof(Buffer.alloc(1, fill), Buffer.alloc(1, fill));
  }

  static get schema() {
    return bufferSchemaFor(ClientIvcProof);
  }

  toJSON() {
    return this.toBuffer();
  }

  static fromBuffer(buffer: Buffer | BufferReader): ClientIvcProof {
    const reader = BufferReader.asReader(buffer);
    return new ClientIvcProof(reader.readBuffer(), reader.readBuffer());
  }

  public toBuffer() {
    return serializeToBuffer(
      this.clientIvcProofBuffer.length,
      this.clientIvcProofBuffer,
      this.clientIvcVkBuffer.length,
      this.clientIvcVkBuffer,
    );
  }
}
