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
    expect(txEffectHash).toMatchInlineSnapshot(`"00635c48027ae44cab65d657c6bc2572808a8a66eaff3fbf7e5cba59129a9c20"`);
  });
});
