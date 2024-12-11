// Serde test for the block proposal type
import { Secp256k1Signer } from '@aztec/foundation/crypto';

import { BlockProposal } from './block_proposal.js';
import { makeBlockProposal } from './mocks.js';

describe('Block Proposal serialization / deserialization', () => {
  const checkEquivalence = (serialized: BlockProposal, deserialized: BlockProposal) => {
    expect(deserialized.getSize()).toEqual(serialized.getSize());
    expect(deserialized).toEqual(serialized);
  };

  it('Should serialize / deserialize', () => {
    const proposal = makeBlockProposal();

    const serialized = proposal.toBuffer();
    const deserialized = BlockProposal.fromBuffer(serialized);
    checkEquivalence(proposal, deserialized);
  });

  it('Should serialize / deserialize + recover sender', () => {
    const account = Secp256k1Signer.random();

    const proposal = makeBlockProposal({ signer: account });
    const serialized = proposal.toBuffer();
    const deserialized = BlockProposal.fromBuffer(serialized);

    checkEquivalence(proposal, deserialized);

    // Recover signature
    const sender = deserialized.getSender();
    expect(sender).toEqual(account.address);
  });
});
