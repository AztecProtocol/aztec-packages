import { TxEffect } from './tx_effect.js';

describe('TxEffect', () => {
  it('convert to and from buffer', () => {
    const txEffect = TxEffect.random();
    const buf = txEffect.toBuffer();
    expect(TxEffect.fromBuffer(buf)).toEqual(txEffect);
  });

  it('convert to and from fields', () => {
    const txEffect = TxEffect.random();
    const fields = txEffect.toFields();
    // TODO(#8954): When logs are refactored into fields, we won't need to inject them here
    expect(
      TxEffect.fromFields(fields, txEffect.noteEncryptedLogs, txEffect.encryptedLogs, txEffect.unencryptedLogs),
    ).toEqual(txEffect);
  });
});
