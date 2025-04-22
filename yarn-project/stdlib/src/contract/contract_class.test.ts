import { Fr } from '@aztec/foundation/fields';

import { FunctionSelector, FunctionType } from '../abi/index.js';
import { getBenchmarkContractArtifact } from '../tests/fixtures.js';
import { getContractClassFromArtifact } from './contract_class.js';

describe('ContractClass', () => {
  it('creates a contract class from a contract compilation artifact', async () => {
    const artifact = getBenchmarkContractArtifact();
    const contractClass = await getContractClassFromArtifact({
      ...artifact,
      artifactHash: Fr.fromHexString('0x1234'),
    });

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
});
