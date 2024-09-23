// Serde test for the block proposal type
import { Secp256k1Signer } from '@aztec/foundation/crypto';

import { BlockProposal } from './block_proposal.js';
import { makeBlockProposal } from './mocks.js';

describe('Block Proposal serialization / deserialization', () => {
  it('Should serialize / deserialize', () => {
    const proposal = makeBlockProposal();

    const serialized = proposal.toBuffer();
    const deserialized = BlockProposal.fromBuffer(serialized);

    expect(deserialized).toEqual(proposal);
  });

  it('Should serialize / deserialize + recover sender', () => {
    const account = Secp256k1Signer.random();

    const proposal = makeBlockProposal(account);
    const serialized = proposal.toBuffer();
    const deserialized = BlockProposal.fromBuffer(serialized);

    expect(deserialized).toEqual(proposal);

    // Recover signature
    const sender = deserialized.getSender();
    expect(sender).toEqual(account.address);
  });
});
