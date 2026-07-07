import { Fr } from '@aztec/foundation/curves/bn254';

import { accumulateInboxRollingHash, updateInboxRollingHash } from './inbox_rolling_hash.js';

describe('inbox rolling hash', () => {
  // Shared test vectors pinned against the noir `accumulate_inbox_rolling_hash` helper (FI-02). Any divergence here
  // means the L1 / noir / TS rolling hashes would disagree.
  const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => new Fr(from + i));

  it('chains a single leaf from zero', () => {
    expect(accumulateInboxRollingHash(Fr.ZERO, [new Fr(11)])).toEqual(
      Fr.fromHexString('0x00815fb1e9d2076ae5761439b6144ad11da69eb6c41ab2aca39e770407ad8d12'),
    );
  });

  it('chains three leaves from zero', () => {
    expect(accumulateInboxRollingHash(Fr.ZERO, [new Fr(11), new Fr(22), new Fr(33)])).toEqual(
      Fr.fromHexString('0x0014cae968461979aab6d33266a2310ed234d3f6cf4472737c57551db07bd0da'),
    );
  });

  it('chains 256 leaves from zero', () => {
    expect(accumulateInboxRollingHash(Fr.ZERO, range(1, 256))).toEqual(
      Fr.fromHexString('0x00ea95b96f17b75be03525b35a2a1918b42f03ad8c00a437cf641751825f3992'),
    );
  });

  it('chains from a non-zero start', () => {
    expect(accumulateInboxRollingHash(new Fr(0x2a), [new Fr(7), new Fr(8)])).toEqual(
      Fr.fromHexString('0x0054d96b8a074a5030a5838972d0a3c04ba47cf5956348c853e02e9566233f65'),
    );
  });

  it('is continuous across segments', () => {
    const start = new Fr(0x2a);
    const mid = updateInboxRollingHash(start, new Fr(7));
    expect(mid).toEqual(Fr.fromHexString('0x0032a934005556d1b9d22708666ee8b05f91fafad624dd64a6ea878e048e5438'));
    // chain(chain(0x2a, [7]), [8]) == chain(0x2a, [7, 8])
    expect(accumulateInboxRollingHash(mid, [new Fr(8)])).toEqual(
      accumulateInboxRollingHash(start, [new Fr(7), new Fr(8)]),
    );
  });

  it('returns the start unchanged for an empty list', () => {
    const start = new Fr(0x2a);
    expect(accumulateInboxRollingHash(start, [])).toEqual(start);
  });
});
