import { P2PMessage } from '@aztec/stdlib/p2p';
import { Tx } from '@aztec/stdlib/tx';

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
});
