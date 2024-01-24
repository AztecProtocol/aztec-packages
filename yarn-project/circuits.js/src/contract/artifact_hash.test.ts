// Cannot list noir-contracts as a devDependency since it'll trigger a circular dependency in tsconfigs
// eslint-disable-next-line import/no-extraneous-dependencies
import { BenchmarkingContractArtifact } from '@aztec/noir-contracts/Benchmarking';

import { getArtifactHash } from './artifact_hash.js';

describe('ArtifactHash', () => {
  it('calculates the artifact hash', () => {
    expect(getArtifactHash(BenchmarkingContractArtifact).toString()).toMatchInlineSnapshot(
      `"0x1cd31b12181cf7516720f4675ffea13c8c538dc4875232776adb8bbe8364ed5c"`,
    );
  });
});
