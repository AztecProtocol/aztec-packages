import { type ContractArtifact } from '@aztec/foundation/abi';
import { loadContractArtifact } from '@aztec/types/abi';
import type { NoirCompiledContract } from '@aztec/types/noir';

import { readFileSync } from 'fs';

import { getPathToFixture, getTestContractArtifact } from '../tests/fixtures.js';
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
      `"0x0dea64e7fa0688017f77bcb7075485485afb4a5f1f8508483398869439f82fdf"`,
    );
  });

  it('calculates the test contract artifact hash multiple times to ensure deterministic hashing', () => {
    const testArtifact = getTestContractArtifact();

    for (let i = 0; i < 5; i++) {
      expect(computeArtifactHash(testArtifact).toString()).toMatchInlineSnapshot(
        `"0x2b227a27f1c358fd2fe9be8244e24bb37524d468bafba055b17667eb44b328b9"`,
      );
    }
  });

  it('calculates the test contract artifact hash', () => {
    const path = getPathToFixture('Test.test.json');
    const content = JSON.parse(readFileSync(path).toString()) as NoirCompiledContract;
    content.outputs.structs.functions.reverse();

    const testArtifact = loadContractArtifact(content);

    expect(computeArtifactHash(testArtifact).toString()).toMatchInlineSnapshot(
      `"0x2b227a27f1c358fd2fe9be8244e24bb37524d468bafba055b17667eb44b328b9"`,
    );
  });
});
