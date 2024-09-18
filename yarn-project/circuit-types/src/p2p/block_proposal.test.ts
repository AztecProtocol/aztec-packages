// Serde test for the block proposal type
import { BlockProposal } from './block_proposal.js';
import { makeBlockProposal, randomSigner } from './mocks.js';

describe('Block Proposal serialization / deserialization', () => {
  it('Should serialize / deserialize', () => {
    const proposal = makeBlockProposal();

    const serialized = proposal.toBuffer();
    const deserialized = BlockProposal.fromBuffer(serialized);

    expect(deserialized).toEqual(proposal);
  });

  it('Should serialize / deserialize + recover sender', () => {
    const account = randomSigner();

    const proposal = makeBlockProposal(account);
    const serialized = proposal.toBuffer();
    const deserialized = BlockProposal.fromBuffer(serialized);

    expect(deserialized).toEqual(proposal);

    // Recover signature
    const sender = deserialized.getSender();
    expect(sender).toEqual(account.address);
  });
});
