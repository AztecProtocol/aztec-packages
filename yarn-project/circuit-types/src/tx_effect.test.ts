import { Fr } from '@aztec/circuits.js';

import { TxEffect } from './tx_effect.js';

describe('TxEffect', () => {
  it('converts to and from buffer', () => {
    const txEffect = TxEffect.random();
    const buf = txEffect.toBuffer();
    expect(TxEffect.fromBuffer(buf)).toEqual(txEffect);
  });

  it('converts to and from fields', () => {
    const txEffect = TxEffect.random();
    const fields = txEffect.toFields();
    // TODO(#8954): When logs are refactored into fields, we won't need to inject them here
    expect(
      TxEffect.fromFields(fields, txEffect.noteEncryptedLogs, txEffect.encryptedLogs, txEffect.unencryptedLogs),
    ).toEqual(txEffect);
  });

  it('converts empty to and from fields', () => {
    const txEffect = TxEffect.empty();
    const fields = txEffect.toFields();
    expect(TxEffect.fromFields(fields)).toEqual(txEffect);
  });

  it('fails with invalid fields', () => {
    let txEffect = TxEffect.random();
    let fields = txEffect.toFields();
    // Replace the initial field with an invalid encoding
    fields[0] = new Fr(12);
    expect(() => TxEffect.fromFields(fields)).toThrow('Invalid fields');

    txEffect = TxEffect.random();
    fields = txEffect.toFields();
    // Add an extra field
    fields.push(new Fr(7));
    // TODO(#8954): When logs are refactored into fields, we won't need to inject them here
    expect(() =>
      TxEffect.fromFields(fields, txEffect.noteEncryptedLogs, txEffect.encryptedLogs, txEffect.unencryptedLogs),
    ).toThrow('Too many fields');

    txEffect = TxEffect.random();
    fields = txEffect.toFields();
    const buf = Buffer.alloc(3);
    buf.writeUint8(6);
    buf.writeUint8(0, 2);
    // Add an extra field which looks like a valid prefix
    const fakePrefix = new Fr(buf);
    fields.push(fakePrefix);
    // TODO(#8954): When logs are refactored into fields, we won't need to inject them here
    expect(() =>
      TxEffect.fromFields(fields, txEffect.noteEncryptedLogs, txEffect.encryptedLogs, txEffect.unencryptedLogs),
    ).toThrow('Invalid fields');
  });
});
