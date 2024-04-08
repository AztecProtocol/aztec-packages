import { getBenchmarkContractArtifact } from '../tests/fixtures.js';
import { computeArtifactHash } from './artifact_hash.js';

describe('ArtifactHash', () => {
  it('calculates the artifact hash', () => {
    const artifact = getBenchmarkContractArtifact();
    expect(computeArtifactHash(artifact).toString()).toMatchInlineSnapshot(
<<<<<<< HEAD
      `"0x2d4bccd3b6452554b94f1677b29bb504771822a192dd11ec34b0f0c8b84e0346"`,
=======
      `"0x0ee3d31bcde5fc51babcede44594a6f010f5aaa4e663c61dfd959a34490f5642"`,
>>>>>>> d7e2e22f4ae93e63dacb0de1be04af04bf9b4109
    );
  });
});
