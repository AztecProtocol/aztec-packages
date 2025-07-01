import { P2PMessage } from '@aztec/stdlib/p2p';
import { Tx } from '@aztec/stdlib/tx';

describe('p2p message', () => {
  it('serializes and deserializes', async () => {
    const tx = Tx.random(true);
    const txAsBuffer = tx.toBuffer();
    const p2pMessage = await P2PMessage.fromGossipable(tx);
    const serialized = p2pMessage.toMessageData();
    const deserializedP2PMessage = P2PMessage.fromMessageData(serialized);
    expect(deserializedP2PMessage.payload.length).toEqual(txAsBuffer.length);
    expect(deserializedP2PMessage.payload).toEqual(txAsBuffer);
    expect(deserializedP2PMessage.id).toEqual(p2pMessage.id);
    expect(deserializedP2PMessage.publishTime).toEqual(p2pMessage.publishTime);
  });
});
