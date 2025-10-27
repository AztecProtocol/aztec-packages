import { poseidon2Hash } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';

import { SpongeBlob } from './sponge_blob.js';
import { makeSpongeBlob } from './testing.js';

describe('SpongeBlob', () => {
  let spongeBlob: SpongeBlob;

  beforeAll(() => {
    spongeBlob = makeSpongeBlob(1);
  });

  it('serializes to buffer and deserializes it back', () => {
    const buffer = spongeBlob.toBuffer();
    const res = SpongeBlob.fromBuffer(buffer);
    expect(res).toEqual(spongeBlob);
  });

  it('serializes to field array and deserializes it back', () => {
    const fieldArray = spongeBlob.toFields();
    const res = SpongeBlob.fromFields(fieldArray);
    expect(res).toEqual(spongeBlob);
  });

  it('matches an ordinary short poseidon2 hash', async () => {
    spongeBlob = await SpongeBlob.init(4);
    const input = [Fr.ONE, new Fr(2), new Fr(3)];
    await spongeBlob.absorb(input);
    const expectedHash = await poseidon2Hash([new Fr(4)].concat(input));
    const res = await spongeBlob.squeeze();
    expect(res).toEqual(expectedHash);
  });

  it('matches an ordinary long poseidon2 hash', async () => {
    spongeBlob = await SpongeBlob.init(4097);
    const input = Array(4096).fill(new Fr(3));
    await spongeBlob.absorb(input);
    const expectedHash = await poseidon2Hash([new Fr(4097)].concat(input));
    const res = await spongeBlob.squeeze();
    expect(res).toEqual(expectedHash);
  });
});
