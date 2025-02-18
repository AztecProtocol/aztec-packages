// Serde test for the block proposal type
import { Secp256k1Signer } from '@aztec/foundation/crypto';

import { BlockProposal } from './block_proposal.js';
import { makeBlockProposal } from './mocks.js';

describe('Block Proposal serialization / deserialization', () => {
  const checkEquivalence = async (original: BlockProposal, deserialized: BlockProposal) => {
    // tmp
    // force compute tx hashes - this is not done in the deserialization
    await Promise.all(deserialized.payload.txs.map(tx => tx.getTxHash()));
    expect(deserialized.getSize()).toEqual(original.getSize());
    expect(deserialized).toEqual(original);
  };

  it('Should serialize / deserialize', async () => {
    const proposal = await makeBlockProposal();

    const serialized = proposal.toBuffer();
    const deserialized = BlockProposal.fromBuffer(serialized);

    await checkEquivalence(proposal, deserialized);
  });

  it('Should serialize / deserialize + recover sender', async () => {
    const account = Secp256k1Signer.random();

    const proposal = await makeBlockProposal({ signer: account });
    const serialized = proposal.toBuffer();
    const deserialized = BlockProposal.fromBuffer(serialized);

    await checkEquivalence(proposal, deserialized);

    // Recover signature
    const sender = await deserialized.getSender();
    expect(sender).toEqual(account.address);
  });
});
