import { P2PMessage } from '@aztec/stdlib/p2p';
import { Tx } from '@aztec/stdlib/tx';

import { makeBlockProposal } from '../tests/mocks.js';

describe('p2p message', () => {
  it('serializes and deserializes', () => {
    const tx = Tx.random({ randomProof: true });
    const txAsBuffer = tx.toBuffer();
    const p2pMessage = P2PMessage.fromGossipable(tx);
    const serialized = p2pMessage.toMessageData();
    const deserializedP2PMessage = P2PMessage.fromMessageData(serialized);
    expect(deserializedP2PMessage.payload.length).toEqual(txAsBuffer.length);
    expect(deserializedP2PMessage.payload).toEqual(txAsBuffer);
  });

  it('serializes and deserializes with instrumentation', () => {
    const tx = Tx.random({ randomProof: true });
    const txAsBuffer = tx.toBuffer();
    const p2pMessage = P2PMessage.fromGossipable(tx, true);
    const serialized = p2pMessage.toMessageData();
    const deserializedP2PMessage = P2PMessage.fromMessageData(serialized, true);
    expect(deserializedP2PMessage.payload.length).toEqual(txAsBuffer.length);
    expect(deserializedP2PMessage.payload).toEqual(txAsBuffer);
  });

  it('Should serialize / deserialize', async () => {
    const txs = await Promise.all([Tx.random(), Tx.random()]);
    const proposal = makeBlockProposal({ txs });
    const proposalAsBuffer = proposal.toBuffer();

    const p2pMessage = P2PMessage.fromGossipable(proposal, true);
    const serialized = p2pMessage.toMessageData();
    const deserializedP2PMessage = P2PMessage.fromMessageData(serialized, true);
    expect(deserializedP2PMessage.payload.length).toEqual(proposalAsBuffer.length);
    expect(deserializedP2PMessage.payload).toEqual(proposalAsBuffer);
  });
});
