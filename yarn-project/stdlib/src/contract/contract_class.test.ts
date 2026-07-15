import { Fr } from '@aztec/foundation/curves/bn254';

import { FunctionSelector, FunctionType } from '../abi/index.js';
import { getBenchmarkContractArtifact } from '../tests/fixtures.js';
import { getContractClassFromArtifact } from './contract_class.js';

describe('ContractClass', () => {
  it('creates a contract class from a contract compilation artifact', async () => {
    const artifact = getBenchmarkContractArtifact();
    const contractClass = await getContractClassFromArtifact(artifact);

    // Assert bytecode has a reasonable length
    expect(contractClass.packedBytecode.length).toBeGreaterThan(100);

    // Check that the packed bytecode is from the only public function.
    const publicFunctions = artifact.functions.filter(f => f.functionType === FunctionType.PUBLIC);
    expect(publicFunctions.length).toBe(1);
    expect(contractClass.packedBytecode).toEqual(publicFunctions[0].bytecode);

    // Check function selectors match
    const privateFunctions = artifact.functions.filter(fn => fn.functionType === FunctionType.PRIVATE);
    const privateFunctionSelectors = await Promise.all(
      privateFunctions.map(fn => FunctionSelector.fromNameAndParameters(fn)),
    );

    expect(new Set(contractClass.privateFunctions.map(fn => fn.selector))).toEqual(new Set(privateFunctionSelectors));
  });

  it('rejects private function selector collisions', async () => {
    const artifact = getBenchmarkContractArtifact();
    const privateFunction = artifact.functions.find(f => f.functionType === FunctionType.PRIVATE && f.verificationKey);
    if (!privateFunction) {
      throw new Error('Expected benchmark fixture to include a private function with a verification key.');
    }

    const collidingArtifact = {
      ...artifact,
      artifactHash: Fr.random(),
      functions: ['fn_selector_collision', 'fn_selector_collision_1442740381'].map(name => ({
        ...privateFunction,
        name,
        parameters: [],
      })),
      nonDispatchPublicFunctions: [],
    };

    await expect(getContractClassFromArtifact(collidingArtifact)).rejects.toThrow(
      /Duplicate private function selector 0x[0-9a-f]+ for fn_selector_collision and fn_selector_collision_1442740381/,
    );
  });
});
