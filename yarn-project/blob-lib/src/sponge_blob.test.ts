import { Fr } from '@aztec/foundation/fields';
import { updateInlineTestData } from '@aztec/foundation/testing/files';

import { SpongeBlob } from './sponge_blob.js';
import { makeSpongeBlob } from './testing.js';

describe('SpongeBlob', () => {
  it('serializes to buffer and deserializes it back', () => {
    const spongeBlob = makeSpongeBlob(1);
    const buffer = spongeBlob.toBuffer();
    const res = SpongeBlob.fromBuffer(buffer);
    expect(res).toEqual(spongeBlob);
  });

  it('serializes to field array and deserializes it back', () => {
    const spongeBlob = makeSpongeBlob(1);
    const fieldArray = spongeBlob.toFields();
    const res = SpongeBlob.fromFields(fieldArray);
    expect(res).toEqual(spongeBlob);
  });

  it('matches a small sponge hash in noir', async () => {
    const spongeBlob = SpongeBlob.init();
    const input = [new Fr(1), new Fr(4), new Fr(7)];
    await spongeBlob.absorb(input);
    const hash = (await spongeBlob.squeeze()).toString();

    expect(hash).toMatchInlineSnapshot('"0x142a2d54d67841d1ab00580036a6bb63e7ff8c1bc4ca5232628a9dde48bd55ae"');

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data.
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/blob_data/sponge_blob.nr',
      'small_sponge_hash_from_ts',
      hash,
    );
  });

  it('matches a full sponge hash in noir', async () => {
    const spongeBlob = SpongeBlob.init();
    const fields = Array.from({ length: SpongeBlob.MAX_FIELDS }).map((_, i) => new Fr(i + 123));
    await spongeBlob.absorb(fields);
    const hash = (await spongeBlob.squeeze()).toString();

    expect(hash).toMatchInlineSnapshot('"0x23f78d3bf4a9e4a96e28d05f4daaa32a91c93dac6e9903246dc69c2290e7a000"');

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data.
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/blob_data/sponge_blob.nr',
      'full_sponge_hash_from_ts',
      hash,
    );
  });
});
