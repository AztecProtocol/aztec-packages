import type { AbiType, ContractArtifact, FunctionArtifact } from '../abi/index.js';
import { getTestContractArtifact } from '../tests/fixtures.js';
import { DEV_VERSION } from '../update-checker/dev_version.js';
import { computeArtifactHash, computeFunctionMetadataHash } from './artifact_hash.js';

describe('ArtifactHash', () => {
  it('calculates the artifact hash', async () => {
    const emptyArtifact: ContractArtifact = {
      fileMap: [],
      functions: [],
      nonDispatchPublicFunctions: [],
      name: 'Test',
      aztecVersion: DEV_VERSION,
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

  describe('computeFunctionMetadataHash', () => {
    it('hashes a returned type the same whether it is read from the singular field or the deprecated list', () => {
      const returnType: AbiType = { kind: 'boolean' };

      expect(computeFunctionMetadataHash(functionWith({ returnType }))).toEqual(
        computeFunctionMetadataHash(functionWith({ returnTypes: [returnType] })),
      );
    });

    it('hashes a function returning nothing the same whether the deprecated list is absent or empty', () => {
      expect(computeFunctionMetadataHash(functionWith({}))).toEqual(
        computeFunctionMetadataHash(functionWith({ returnTypes: [] })),
      );
    });
  });
});

function functionWith(returns: Pick<FunctionArtifact, 'returnType' | 'returnTypes'>): FunctionArtifact {
  return { ...returns } as FunctionArtifact;
}
