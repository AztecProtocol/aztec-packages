import { getSampleContractArtifact } from '../tests/fixtures.js';
import { computeArtifactHash } from './artifact_hash.js';

describe('ArtifactHash', () => {
  it('calculates the artifact hash', () => {
    const artifact = getSampleContractArtifact();
    expect(computeArtifactHash(artifact).toString()).toMatchInlineSnapshot(
      `"0x1d1e8f03c63b76d26cfd04ce728586c014768cec6765fdb8f3f24cb931b5ec17"`,
    );
  });
});
