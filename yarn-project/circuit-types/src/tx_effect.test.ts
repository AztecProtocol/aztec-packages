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
<<<<<<< HEAD
    expect(txEffectHash).toMatchInlineSnapshot(`"008e06738f2ac46a9104ebda20fba2aee88442fe884fe4476e969fce00832d5a"`);
=======
    expect(txEffectHash).toMatchInlineSnapshot(`"0016cc39e093d21650607a4fe4ccbbb56b1219575378edea7fbe80a96e909603"`);
>>>>>>> master
  });
});
