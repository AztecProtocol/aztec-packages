import { poseidon2Hash } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';

import { SPONGE_BLOB_LENGTH } from '../constants.gen.js';
import { makeSpongeBlob } from '../tests/factories.js';
import { SpongeBlob } from './sponge_blob.js';

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

  it('number of fields matches constant', () => {
    const fields = spongeBlob.sponge.cache.concat([
      ...spongeBlob.sponge.state,
      new Fr(spongeBlob.sponge.cacheSize),
      new Fr(spongeBlob.sponge.squeezeMode),
      new Fr(spongeBlob.fields),
      new Fr(spongeBlob.expectedFields),
    ]);
    expect(fields.length).toBe(SPONGE_BLOB_LENGTH);
  });

  it('matches an ordinary short poseidon2 hash', () => {
    spongeBlob = SpongeBlob.init(4);
    const input = [Fr.ONE, new Fr(2), new Fr(3), new Fr(4)];
    spongeBlob.absorb(input);
    const expectedHash = poseidon2Hash(input);
    const res = spongeBlob.squeeze();
    expect(res).toEqual(expectedHash);
  });

  it('matches an ordinary long poseidon2 hash', () => {
    spongeBlob = SpongeBlob.init(4096);
    const input = Array(4096).fill(new Fr(3));
    spongeBlob.absorb(input);
    const expectedHash = poseidon2Hash(input);
    const res = spongeBlob.squeeze();
    expect(res).toEqual(expectedHash);
  });
});
