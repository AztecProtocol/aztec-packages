import { FunctionSelector, FunctionType } from '@aztec/foundation/abi';
import { Fr } from '@aztec/foundation/fields';

import { PUBLIC_DISPATCH_SELECTOR } from '../constants.gen.js';
import { getBenchmarkContractArtifact } from '../tests/fixtures.js';
import { getContractClassFromArtifact } from './contract_class.js';

describe('ContractClass', () => {
  it('creates a contract class from a contract compilation artifact', () => {
    const artifact = getBenchmarkContractArtifact();
    const contractClass = getContractClassFromArtifact({
      ...artifact,
      artifactHash: Fr.fromHexString('0x1234'),
    });

    // Assert bytecode has a reasonable length
    expect(contractClass.packedBytecode.length).toBeGreaterThan(100);
    contractClass.publicFunctions.forEach(publicFunction => {
      expect(publicFunction.bytecode.length).toBeGreaterThan(100);
    });

    // Check function selectors match
    const publicFunctionSelectors = [FunctionSelector.fromField(new Fr(PUBLIC_DISPATCH_SELECTOR))];
    const privateFunctionSelectors = artifact.functions
      .filter(fn => fn.functionType === FunctionType.PRIVATE)
      .map(fn => FunctionSelector.fromNameAndParameters(fn));

    expect(new Set(contractClass.publicFunctions.map(fn => fn.selector))).toEqual(new Set(publicFunctionSelectors));
    expect(new Set(contractClass.privateFunctions.map(fn => fn.selector))).toEqual(new Set(privateFunctionSelectors));
  });
});
