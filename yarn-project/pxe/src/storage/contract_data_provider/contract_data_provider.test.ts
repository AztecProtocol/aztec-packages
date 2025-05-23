import { Fr } from '@aztec/foundation/fields';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { BenchmarkingContractArtifact } from '@aztec/noir-test-contracts.js/Benchmarking';
import { TestContractArtifact } from '@aztec/noir-test-contracts.js/Test';
import { FunctionType } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { SerializableContractInstance } from '@aztec/stdlib/contract';

import { ContractDataProvider } from './contract_data_provider.js';

describe('ContractDataProvider', () => {
  let contractDataProvider: ContractDataProvider;

  beforeEach(async () => {
    const store = await openTmpStore('contract_data_provider_test');
    contractDataProvider = new ContractDataProvider(store);
  });

  it('stores a contract artifact', async () => {
    const artifact = BenchmarkingContractArtifact;
    const id = Fr.random();
    await contractDataProvider.addContractArtifact(id, artifact);
    await expect(contractDataProvider.getContractArtifact(id)).resolves.toEqual(artifact);
  });

  it('does not store a contract artifact with a duplicate private function selector', async () => {
    const artifact = TestContractArtifact;
    const index = artifact.functions.findIndex(fn => fn.functionType === FunctionType.PRIVATE);

    const copiedFn = structuredClone(artifact.functions[index]);
    artifact.functions.push(copiedFn);

    const id = Fr.random();
    await expect(contractDataProvider.addContractArtifact(id, artifact)).rejects.toThrow(
      'Repeated function selectors of private functions',
    );
  });

  it('stores a contract instance', async () => {
    const address = await AztecAddress.random();
    const instance = (await SerializableContractInstance.random()).withAddress(address);
    await contractDataProvider.addContractInstance(instance);
    await expect(contractDataProvider.getContractInstance(address)).resolves.toEqual(instance);
  });
});
