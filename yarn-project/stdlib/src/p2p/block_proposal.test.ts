// Serde test for the block proposal type
import { Secp256k1Signer } from '@aztec/foundation/crypto';
import { Signature } from '@aztec/foundation/eth-signature';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { makeBlockProposal } from '../tests/mocks.js';
import { Tx } from '../tx/tx.js';
import { BlockProposal } from './block_proposal.js';
import { ConsensusPayload } from './consensus_payload.js';

class BackwardsCompatibleBlockProposal extends BlockProposal {
  constructor(payload: ConsensusPayload, signature: Signature) {
    super(1, payload, signature, undefined);
  }

  oldToBuffer(): Buffer {
    return serializeToBuffer([this.blockNumber, this.payload, this.signature]);
  }

  static oldFromBuffer(buf: Buffer | BufferReader): BlockProposal {
    const reader = BufferReader.asReader(buf);
    return new BlockProposal(reader.readNumber(), reader.readObject(ConsensusPayload), reader.readObject(Signature));
  }
}

describe('Block Proposal serialization / deserialization', () => {
  const checkEquivalence = (serialized: BlockProposal, deserialized: BlockProposal) => {
    expect(deserialized.getSize()).toEqual(serialized.getSize());
    expect(deserialized).toEqual(serialized);
  };

  it('Should serialize / deserialize', async () => {
    const txs = await Promise.all([Tx.random(), Tx.random()]);
    const proposal = makeBlockProposal({ txs });

    const serialized = proposal.toBuffer();
    const deserialized = BlockProposal.fromBuffer(serialized);
    checkEquivalence(proposal, deserialized);
  });

  it('Should serialize / deserialize with or without included txs', async () => {
    const txs = await Promise.all([Tx.random(), Tx.random()]);
    const proposalWithTxs = makeBlockProposal({ txs });

    const oldProposal = new BackwardsCompatibleBlockProposal(proposalWithTxs.payload, proposalWithTxs.signature);

    const serializedWithTxs = proposalWithTxs.toBuffer();
    const serializedWithoutTxs = oldProposal.oldToBuffer();

    const deserializedWithTxs = BlockProposal.fromBuffer(serializedWithTxs);
    const deserializedWithoutTxs = BlockProposal.fromBuffer(serializedWithoutTxs);

    const oldDeserializedWithTxs = BackwardsCompatibleBlockProposal.oldFromBuffer(serializedWithTxs);
    const oldDeserializedWithoutTxs = BackwardsCompatibleBlockProposal.oldFromBuffer(serializedWithoutTxs);

    expect(deserializedWithTxs.archive).toEqual(deserializedWithoutTxs.archive);
    expect(deserializedWithoutTxs.archive).toEqual(oldDeserializedWithTxs.archive);
    expect(oldDeserializedWithTxs.archive).toEqual(oldDeserializedWithoutTxs.archive);
  });

  it('Should serialize / deserialize + recover sender', async () => {
    const account = Secp256k1Signer.random();

    const txs = await Promise.all([Tx.random(), Tx.random()]);
    const proposal = makeBlockProposal({ txs, signer: account });
    const serialized = proposal.toBuffer();
    const deserialized = BlockProposal.fromBuffer(serialized);

    checkEquivalence(proposal, deserialized);

    // Recover signature
    const sender = deserialized.getSender();
    expect(sender).toEqual(account.address);
  });
});
