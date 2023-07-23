import { newBarretenbergApiSync } from '../factory/index.js';
import { Buffer32, Fr } from '../types/index.js';
import { BarretenbergApiSync } from './index.js';

describe('blake2s', () => {
  let api: BarretenbergApiSync;

  beforeAll(async () => {
    api = await newBarretenbergApiSync();
  });

  afterAll(async () => {
    await api.destroy();
  });

  it('blake2s', () => {
    const input = Buffer.from('abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789');
    const expected = Buffer32.fromBuffer(
      new Uint8Array([
        0x44, 0xdd, 0xdb, 0x39, 0xbd, 0xb2, 0xaf, 0x80, 0xc1, 0x47, 0x89, 0x4c, 0x1d, 0x75, 0x6a, 0xda, 0x3d, 0x1c,
        0x2a, 0xc2, 0xb1, 0x00, 0x54, 0x1e, 0x04, 0xfe, 0x87, 0xb4, 0xa5, 0x9e, 0x12, 0x43,
      ]),
    );
    const result = api.blake2s(input);
    expect(result).toEqual(expected);
  });

  it('blake2sToField', () => {
    const input = Buffer.from('abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789');
    const expected = Fr.fromBufferReduce(
      new Uint8Array([
        0x44, 0xdd, 0xdb, 0x39, 0xbd, 0xb2, 0xaf, 0x80, 0xc1, 0x47, 0x89, 0x4c, 0x1d, 0x75, 0x6a, 0xda, 0x3d, 0x1c,
        0x2a, 0xc2, 0xb1, 0x00, 0x54, 0x1e, 0x04, 0xfe, 0x87, 0xb4, 0xa5, 0x9e, 0x12, 0x43,
      ]),
    );
    const result = api.blake2sToField(input);
    expect(result).toEqual(expected);
  });
});
