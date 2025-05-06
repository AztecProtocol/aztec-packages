import { Fr } from '@aztec/foundation/fields';
import { jsonStringify } from '@aztec/foundation/json-rpc';

import { TxEffect } from './tx_effect.js';

describe('TxEffect', () => {
  it('converts to and from buffer', async () => {
    const txEffect = await TxEffect.random();
    const buf = txEffect.toBuffer();
    expect(TxEffect.fromBuffer(buf)).toEqual(txEffect);
  });

  it('converts to and from fields', async () => {
    const txEffect = await TxEffect.random();
    const fields = txEffect.toBlobFields();
    expect(TxEffect.fromBlobFields(fields)).toEqual(txEffect);
  });

  it('converts empty to and from fields', () => {
    const txEffect = TxEffect.empty();
    const fields = txEffect.toBlobFields();
    expect(TxEffect.fromBlobFields(fields)).toEqual(txEffect);
  });

  it('convert to and from json', async () => {
    const txEffect = await TxEffect.random();
    const parsed = TxEffect.schema.parse(JSON.parse(jsonStringify(txEffect)));
    expect(parsed).toEqual(txEffect);
  });

  it('fails with invalid fields', async () => {
    const txEffect = await TxEffect.random();
    const fields = txEffect.toBlobFields();
    // Replace the initial field with an invalid encoding
    fields[0] = new Fr(12);
    expect(() => TxEffect.fromBlobFields(fields)).toThrow('Invalid fields');
  });

  it('fails with too few remaining fields', async () => {
    const txEffect = await TxEffect.random();
    const fields = txEffect.toBlobFields();
    fields.pop();
    expect(() => TxEffect.fromBlobFields(fields)).toThrow('Not enough fields');
  });

  it('ignores extra fields', async () => {
    const txEffect = await TxEffect.random();
    const fields = txEffect.toBlobFields();
    fields.push(new Fr(7));
    expect(TxEffect.fromBlobFields(fields)).toEqual(txEffect);
  });
});
