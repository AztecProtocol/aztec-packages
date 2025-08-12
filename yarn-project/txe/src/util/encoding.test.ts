import { Fr } from '@aztec/aztec.js';

import { fromSingle, stringsToBuffers, toSingle } from './encoding.js';

describe('foreign call arg serialization', () => {
  it('serializes and deserializes a field', () => {
    const field = Uint8Array.from(new Fr(1).toBuffer());

    const fieldInTXE = fromSingle(field);
    const fieldAfterTxe = toSingle(fieldInTXE);

    expect(fieldAfterTxe).toEqual(field);
  });

  it('converts strings to buffers', () => {
    const fields = ['0x0000000000000000000000000000000000000000000000000000000000000001'];

    const fieldInTXE = stringsToBuffers(fields);

    expect(fieldInTXE).toEqual([Uint8Array.from(new Fr(1).toBuffer())]);
  });
});
