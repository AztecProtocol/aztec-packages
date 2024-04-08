import { getBenchmarkContractArtifact } from '../tests/fixtures.js';
import { computeArtifactHash } from './artifact_hash.js';

describe('ArtifactHash', () => {
  it('calculates the artifact hash', () => {
    const artifact = getBenchmarkContractArtifact();
    expect(computeArtifactHash(artifact).toString()).toMatchInlineSnapshot(
      `"0x0ee3d31bcde5fc51babcede44594a6f010f5aaa4e663c61dfd959a34490f5642"`,
    );
  });
});
