import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

// For the sake of this example, the proposals are just a message that is signed by the proposer
// In reality it should be an array of Txs?
export class BlockProposal {
  constructor(public readonly message: Buffer, public readonly signature: Buffer) {}

  toBuffer() {
    return serializeToBuffer([this.message, this.signature]);
  }

  static fromBuffer(buffer: Buffer | BufferReader): BlockProposal {
    const reader = BufferReader.asReader(buffer);
    return new BlockProposal(reader.readBuffer(), reader.readBuffer());
  }
}
