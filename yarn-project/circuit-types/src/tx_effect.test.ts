import { TxEffect } from './tx_effect.js';

describe('TxEffect', () => {
  it('convert to and from buffer', () => {
    const txEffect = TxEffect.random();
    const buf = txEffect.toBuffer();
    expect(TxEffect.fromBuffer(buf)).toEqual(txEffect);
  });

  it('hash of empty tx effect matches snapshot', () => {
    const txEffectHash = TxEffect.empty().hash().toString('hex');
    // If you change this you have to change the hardcoded value in TxsDecoder.sol!
    expect(txEffectHash).toMatchInlineSnapshot(`"00c2dece9c9f14c67b8aafabdcb80793f1cffe95a801e15d648fd214a0522ee8"`);
  });
});
