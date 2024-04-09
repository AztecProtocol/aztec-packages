import { getBenchmarkContractArtifact } from '../tests/fixtures.js';
import { computeArtifactHash } from './artifact_hash.js';

describe('ArtifactHash', () => {
  it('calculates the artifact hash', () => {
    const artifact = getBenchmarkContractArtifact();
    expect(computeArtifactHash(artifact).toString()).toMatchInlineSnapshot(
      `"0x229892774c9b35d11c5ee15a2f325ff3ece89a96f1348cd93d0546b8eb8b06de"`,
    );
  });
});
