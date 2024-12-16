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
    const fields = txEffect.toBlobFields();
    // TODO(#8954): When logs are refactored into fields, we won't need to inject them here
    expect(TxEffect.fromBlobFields(fields, txEffect.unencryptedLogs, txEffect.contractClassLogs)).toEqual(txEffect);
  });

  it('converts empty to and from fields', () => {
    const txEffect = TxEffect.empty();
    const fields = txEffect.toBlobFields();
    expect(TxEffect.fromBlobFields(fields)).toEqual(txEffect);
  });

  it('fails with invalid fields', () => {
    let txEffect = TxEffect.random();
    let fields = txEffect.toBlobFields();
    // Replace the initial field with an invalid encoding
    fields[0] = new Fr(12);
    expect(() => TxEffect.fromBlobFields(fields)).toThrow('Invalid fields');

    txEffect = TxEffect.random();
    fields = txEffect.toBlobFields();
    // Add an extra field
    fields.push(new Fr(7));
    // TODO(#8954): When logs are refactored into fields, we won't need to inject them here
    expect(() => TxEffect.fromBlobFields(fields, txEffect.unencryptedLogs, txEffect.contractClassLogs)).toThrow(
      'Too many fields',
    );

    txEffect = TxEffect.random();
    fields = txEffect.toBlobFields();
    const buf = Buffer.alloc(4);
    buf.writeUint8(6);
    buf.writeUint16BE(0, 2);
    // Add an extra field which looks like a valid prefix
    const fakePrefix = new Fr(buf);
    fields.push(fakePrefix);
    // TODO(#8954): When logs are refactored into fields, we won't need to inject them here
    expect(() => TxEffect.fromBlobFields(fields, txEffect.unencryptedLogs, txEffect.contractClassLogs)).toThrow(
      'Invalid fields',
    );
  });
});
