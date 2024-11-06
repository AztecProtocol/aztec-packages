import { Fr } from '@aztec/circuits.js';

import { Body } from './body.js';

describe('Body', () => {
  it('converts to and from buffer', () => {
    const body = Body.random();
    const buf = body.toBuffer();
    expect(Body.fromBuffer(buf)).toEqual(body);
  });

  it('converts to and from fields', () => {
    const body = Body.random();
    const fields = body.toFields();
    // TODO(#8954): When logs are refactored into fields, we won't need to inject them here
    expect(Body.fromFields(fields, body.noteEncryptedLogs, body.encryptedLogs, body.unencryptedLogs)).toEqual(body);
  });

  it('converts empty to and from fields', () => {
    const body = Body.empty();
    const fields = body.toFields();
    expect(Body.fromFields(fields)).toEqual(body);
  });

  it('fails with invalid fields', () => {
    const body = Body.random();
    const fields = body.toFields();
    // Replace the initial field with an invalid encoding
    fields[0] = new Fr(12);
    expect(() => Body.fromFields(fields)).toThrow('Invalid fields');
  });
});
