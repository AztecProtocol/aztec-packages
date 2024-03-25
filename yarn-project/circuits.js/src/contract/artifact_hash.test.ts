import { getSampleContractArtifact } from '../tests/fixtures.js';
import { computeArtifactHash } from './artifact_hash.js';

describe('ArtifactHash', () => {
  it('calculates the artifact hash', () => {
    const artifact = getSampleContractArtifact();
    expect(computeArtifactHash(artifact).toString()).toMatchInlineSnapshot(
      `"0x112046d612e778f81f12762a0818b9bf8b266f34b84d210d28614c4aff7c66b6"`,
    );
  });
});
