import { FactStoreFixtureContractArtifact } from '@aztec/noir-test-contracts.js/FactStoreFixture';
import { FunctionType } from '@aztec/stdlib/abi';

describe('FactStoreFixture artifact', () => {
  it('exposes the offchain_reception_fold utility function', () => {
    const fold = FactStoreFixtureContractArtifact.functions.find(f => f.name === 'offchain_reception_fold');
    expect(fold).toBeDefined();
    expect(fold!.functionType).toBe(FunctionType.UTILITY);
  });
});
