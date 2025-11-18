import { jsonStringify } from '@aztec/foundation/json-rpc';

import { Body } from './body.js';

describe('Body', () => {
  it('converts to and from buffer', async () => {
    const body = await Body.random();
    const buf = body.toBuffer();
    expect(Body.fromBuffer(buf)).toEqual(body);
  });

  it('converts to and from blob data', async () => {
    const body = await Body.random();
    const fields = body.toTxBlobData();
    expect(Body.fromTxBlobData(fields)).toEqual(body);
  });

  it('converts to and from empty blob data', () => {
    const body = Body.empty();
    const fields = body.toTxBlobData();
    expect(Body.fromTxBlobData(fields)).toEqual(body);
  });

  it('convert to and from json', async () => {
    const body = await Body.random();
    const parsed = Body.schema.parse(JSON.parse(jsonStringify(body)));
    expect(parsed).toEqual(body);
  });
});
