import type { ContractArtifact } from '../abi/index.js';
import { getTestContractArtifact } from '../tests/fixtures.js';
import { computeArtifactHash } from './artifact_hash.js';

describe('ArtifactHash', () => {
  it('calculates the artifact hash', async () => {
    const emptyArtifact: ContractArtifact = {
      fileMap: [],
      functions: [],
      nonDispatchPublicFunctions: [],
      name: 'Test',
      outputs: {
        globals: {},
        structs: {},
      },
      storageLayout: {},
    };
    const hash = await computeArtifactHash(emptyArtifact);
    expect(hash.toString()).toMatchInlineSnapshot(
      `"0x0dea64e7fa0688017f77bcb7075485485afb4a5f1f8508483398869439f82fdf"`,
    );
  });

  it('calculates the test contract artifact hash multiple times to ensure deterministic hashing', async () => {
    const testArtifact = getTestContractArtifact();

    const calculatedArtifactHash = (await computeArtifactHash(testArtifact)).toString();
    for (let i = 0; i < 2; i++) {
      const testArtifactHash = await computeArtifactHash(testArtifact);
      expect(testArtifactHash.toString()).toBe(calculatedArtifactHash);
    }
  });
});
