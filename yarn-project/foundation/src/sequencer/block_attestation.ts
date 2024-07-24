import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { BlockProposal } from './block_proposal.js';

export class BlockAttestation {
  constructor(public readonly blockProposal: BlockProposal, public readonly signature: Buffer) {}

  toBuffer() {
    return serializeToBuffer([this.blockProposal, this.signature]);
  }

  static fromBuffer(buffer: Buffer | BufferReader): BlockAttestation {
    const reader = BufferReader.asReader(buffer);
    return new BlockAttestation(reader.readObject(BlockProposal), reader.readBuffer());
  }
}
