import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { Signature } from './signature.js';


export class ProposalMessage {
  constructor(public readonly message: Buffer) {}

  toBuffer() {
    return serializeToBuffer([this.message.length, this.message]);
  }

  static fromBuffer(buffer: Buffer | BufferReader): ProposalMessage {
    const reader = BufferReader.asReader(buffer);
    return new ProposalMessage(reader.readBuffer());
  }
}


// For the sake of this example, the proposals are just a message that is signed by the proposer
// In reality it should be an array of Txs?
export class BlockProposal {
  constructor(public readonly message: ProposalMessage, public readonly signature: Signature) {}

  toBuffer() {
    return serializeToBuffer([this.message, this.signature]);
  }

  static fromBuffer(buffer: Buffer | BufferReader): BlockProposal {
    console.log("the buffer: ", buffer);
    const reader = BufferReader.asReader(buffer);
    return new BlockProposal(reader.readObject(ProposalMessage), reader.readObject(Signature));
  }

}
