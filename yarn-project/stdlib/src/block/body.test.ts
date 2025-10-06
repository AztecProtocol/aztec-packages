import { Fr } from '@aztec/foundation/fields';
import { jsonStringify } from '@aztec/foundation/json-rpc';

import { Body, createBlockEndMarker } from './body.js';

describe('Body', () => {
  it('converts to and from buffer', async () => {
    const body = await Body.random();
    const buf = body.toBuffer();
    expect(Body.fromBuffer(buf)).toEqual(body);
  });

  it('converts to and from blob fields', async () => {
    const body = await Body.random();
    const fields = body.toBlobFields();
    expect(Body.fromBlobFields(fields)).toEqual(body);
  });

  it('converts to and from empty blob fields', () => {
    const body = Body.empty();
    const fields = body.toBlobFields();
    expect(Body.fromBlobFields(fields)).toEqual(body);
  });

  it('fails with invalid blob fields', async () => {
    const body = await Body.random();
    const fields = body.toBlobFields();
    // Replace the initial field with an invalid encoding
    fields[0] = new Fr(12);
    expect(() => Body.fromBlobFields(fields)).toThrow('Invalid fields');
  });

  it('fails with too many blob fields', async () => {
    const body = await Body.random();
    const fields = body.toBlobFields();
    fields.push(new Fr(7));
    expect(() => Body.fromBlobFields(fields)).toThrow('Invalid fields');
  });

  it('fails with too few blob fields', async () => {
    const body = await Body.random();
    const fields = body.toBlobFields();
    fields.pop();
    expect(() => Body.fromBlobFields(fields)).toThrow('Not enough fields');
  });

  it('fails with random block end marker', async () => {
    const body = await Body.random();
    const fields = body.toBlobFields();
    fields[fields.length - 1] = Fr.random();
    expect(() => Body.fromBlobFields(fields)).toThrow('Block end marker not found');
  });

  it('fails with too many txs', async () => {
    const numTxs = 4;
    const body = await Body.random(numTxs);
    const fields = body.toBlobFields();
    fields[fields.length - 1] = createBlockEndMarker(numTxs - 1);
    expect(() => Body.fromBlobFields(fields)).toThrow('Expected 3 txs, but got 4');
  });

  it('fails with too few txs', async () => {
    const numTxs = 4;
    const body = await Body.random(numTxs);
    const fields = body.toBlobFields();
    fields[fields.length - 1] = createBlockEndMarker(numTxs + 1);
    expect(() => Body.fromBlobFields(fields)).toThrow('Expected 5 txs, but got 4');
  });

  it('convert to and from json', async () => {
    const body = await Body.random();
    const parsed = Body.schema.parse(JSON.parse(jsonStringify(body)));
    expect(parsed).toEqual(body);
  });
});
