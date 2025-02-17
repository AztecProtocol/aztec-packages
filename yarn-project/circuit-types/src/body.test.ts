import { Fr } from '@aztec/circuits.js';

import { Body } from './body.js';

describe('Body', () => {
  it('converts to and from buffer', async () => {
    const body = await Body.random();
    const buf = body.toBuffer();
    expect(Body.fromBuffer(buf)).toEqual(body);
  });

  it('converts to and from fields', async () => {
    const body = await Body.random();
    const fields = body.toBlobFields();
    expect(Body.fromBlobFields(fields)).toEqual(body);
  });

  it('converts empty to and from fields', () => {
    const body = Body.empty();
    const fields = body.toBlobFields();
    expect(Body.fromBlobFields(fields)).toEqual(body);
  });

  it('fails with invalid fields', async () => {
    const body = await Body.random();
    const fields = body.toBlobFields();
    // Replace the initial field with an invalid encoding
    fields[0] = new Fr(12);
    expect(() => Body.fromBlobFields(fields)).toThrow('Invalid fields');
  });
});
