import { type ContractArtifact } from '@aztec/foundation/abi';

import { computeArtifactHash } from './artifact_hash.js';

describe('ArtifactHash', () => {
  it('calculates the artifact hash', () => {
    const emptyArtifact: ContractArtifact = {
      fileMap: [],
      functions: [],
      name: 'Test',
      outputs: {
        globals: {},
        structs: {},
      },
      storageLayout: {},
      notes: {},
    };
    expect(computeArtifactHash(emptyArtifact).toString()).toMatchInlineSnapshot(
      `"0x0c6fd9b48570721c5d36f978d084d77cacbfd2814f1344985f40e62bea6e61be"`,
    );
  });
});
