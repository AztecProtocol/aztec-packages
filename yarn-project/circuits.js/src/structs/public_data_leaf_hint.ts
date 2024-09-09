import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { PUBLIC_DATA_TREE_HEIGHT } from '../constants.gen.js';
import { MembershipWitness } from './membership_witness.js';
import { PublicDataTreeLeafPreimage } from './trees/index.js';

export class PublicDataLeafHint {
  constructor(
    public preimage: PublicDataTreeLeafPreimage,
    public membershipWitness: MembershipWitness<typeof PUBLIC_DATA_TREE_HEIGHT>,
  ) {}

  static empty() {
    return new PublicDataLeafHint(PublicDataTreeLeafPreimage.empty(), MembershipWitness.empty(PUBLIC_DATA_TREE_HEIGHT));
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PublicDataLeafHint(
      reader.readObject(PublicDataTreeLeafPreimage),
      MembershipWitness.fromBuffer(reader, PUBLIC_DATA_TREE_HEIGHT),
    );
  }

  toBuffer() {
    return serializeToBuffer(this.preimage, this.membershipWitness);
  }
}
