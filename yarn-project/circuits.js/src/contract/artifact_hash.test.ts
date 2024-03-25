import { getSampleContractArtifact } from '../tests/fixtures.js';
import { computeArtifactHash } from './artifact_hash.js';

describe('ArtifactHash', () => {
  it('calculates the artifact hash', () => {
    const artifact = getSampleContractArtifact();
    expect(computeArtifactHash(artifact).toString()).toMatchInlineSnapshot(
      `"0x2be6833e88c1468b0494419b538155465c63e66e5ad63f08e1e7861a6a096137"`,
    );
  });
});
