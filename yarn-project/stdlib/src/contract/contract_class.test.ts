import { PUBLIC_DISPATCH_SELECTOR } from '@aztec/constants';
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
    contractClass.publicFunctions.forEach(publicFunction => {
      // TODO(#8985): The below should only contain the public dispatch function, and no others
      expect(publicFunction.bytecode.length).toBeGreaterThan(100);
    });

    // Check function selectors match
    const publicFunctionSelectors = [FunctionSelector.fromField(new Fr(PUBLIC_DISPATCH_SELECTOR))];
    const privateFunctions = artifact.functions.filter(fn => fn.functionType === FunctionType.PRIVATE);

    const privateFunctionSelectors = await Promise.all(
      privateFunctions.map(fn => FunctionSelector.fromNameAndParameters(fn)),
    );

    expect(new Set(contractClass.publicFunctions.map(fn => fn.selector))).toEqual(new Set(publicFunctionSelectors));
    expect(new Set(contractClass.privateFunctions.map(fn => fn.selector))).toEqual(new Set(privateFunctionSelectors));
  });
});
