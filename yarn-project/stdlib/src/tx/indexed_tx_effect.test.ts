import { deserializeIndexedTxEffect, randomIndexedTxEffect, serializeIndexedTxEffect } from './indexed_tx_effect.js';

describe('IndexedTxEffect', () => {
  it('serializes and deserializes correctly', async () => {
    const effect = await randomIndexedTxEffect();

    const serialized = serializeIndexedTxEffect(effect);
    const deserialized = deserializeIndexedTxEffect(serialized);

    expect(deserialized.l2BlockHash).toEqual(effect.l2BlockHash);
    expect(deserialized.l2BlockNumber).toEqual(effect.l2BlockNumber);
    expect(deserialized.txIndexInBlock).toEqual(effect.txIndexInBlock);
    expect(deserialized.data).toEqual(effect.data);
  });
});
