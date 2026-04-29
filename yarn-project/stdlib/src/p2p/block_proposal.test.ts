// Serde test for the block proposal type
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Signature } from '@aztec/foundation/eth-signature';

import { TEST_COORDINATION_SIGNATURE_CONTEXT, makeBlockProposal } from '../tests/mocks.js';
import { Tx } from '../tx/tx.js';
import { BlockProposal } from './block_proposal.js';
import { SignedTxs } from './signed_txs.js';

describe('Block Proposal serialization / deserialization', () => {
  const checkEquivalence = (serialized: BlockProposal, deserialized: BlockProposal) => {
    expect(deserialized.getSize()).toEqual(serialized.getSize());
    expect(deserialized).toEqual(serialized);
  };

  it('Should serialize / deserialize', async () => {
    const txs = await Promise.all([Tx.random(), Tx.random()]);
    const proposal = await makeBlockProposal({ txs });

    const serialized = proposal.toBuffer();
    const deserialized = BlockProposal.fromBuffer(serialized);
    checkEquivalence(proposal, deserialized);
  });

  it('Should serialize / deserialize without txs', async () => {
    const proposal = await makeBlockProposal();

    const serialized = proposal.toBuffer();
    const deserialized = BlockProposal.fromBuffer(serialized);

    expect(deserialized.archive).toEqual(proposal.archive);
    expect(deserialized.blockHeader.equals(proposal.blockHeader)).toBe(true);
    expect(deserialized.txHashes).toEqual(proposal.txHashes);
    expect(deserialized.txs).toBeUndefined();
  });

  it('Should serialize / deserialize with txs', async () => {
    const txs = await Promise.all([Tx.random(), Tx.random()]);
    const proposal = await makeBlockProposal({ txs });

    const serialized = proposal.toBuffer();
    const deserialized = BlockProposal.fromBuffer(serialized);

    expect(deserialized.archive).toEqual(proposal.archive);
    expect(deserialized.blockHeader.equals(proposal.blockHeader)).toBe(true);
    expect(deserialized.txHashes).toEqual(proposal.txHashes);
    expect(deserialized.txs?.length).toEqual(txs.length);
  });

  it('Should serialize / deserialize + recover sender', async () => {
    const account = Secp256k1Signer.random();

    const txs = await Promise.all([Tx.random(), Tx.random()]);
    const proposal = await makeBlockProposal({ txs, signer: account });
    const serialized = proposal.toBuffer();
    const deserialized = BlockProposal.fromBuffer(serialized);

    checkEquivalence(proposal, deserialized);

    // Recover signature
    const sender = deserialized.getSender();
    expect(sender).toEqual(account.address);
  });

  it('Should expose block info via accessor methods', async () => {
    const proposal = await makeBlockProposal();

    expect(proposal.slotNumber).toBe(proposal.blockHeader.getSlot());
    expect(proposal.blockNumber).toBe(proposal.blockHeader.getBlockNumber());
  });

  it('getSender returns undefined when inner signedTxs carries a foreign signing domain', async () => {
    const account = Secp256k1Signer.random();
    const txs = await Promise.all([Tx.random(), Tx.random()]);
    const proposal = await makeBlockProposal({ txs, signer: account });

    const foreignContext = {
      ...TEST_COORDINATION_SIGNATURE_CONTEXT,
      chainId: TEST_COORDINATION_SIGNATURE_CONTEXT.chainId + 1,
    };
    const foreignSignedTxs = new SignedTxs(txs, Signature.random(), foreignContext);
    const tampered = new BlockProposal(
      proposal.blockHeader,
      proposal.indexWithinCheckpoint,
      proposal.inHash,
      proposal.archiveRoot,
      proposal.txHashes,
      proposal.signature,
      proposal.signatureContext,
      foreignSignedTxs,
    );

    expect(tampered.getSender()).toBeUndefined();
  });
});
