import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { BenchmarkingContractArtifact } from '@aztec/noir-test-contracts.js/Benchmarking';
import { TestContractArtifact } from '@aztec/noir-test-contracts.js/Test';
import { FunctionType } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { SerializableContractInstance, getContractClassFromArtifact } from '@aztec/stdlib/contract';

import { jest } from '@jest/globals';

import { ContractStore } from './contract_store.js';

describe('ContractStore', () => {
  let contractStore: ContractStore;

  beforeEach(async () => {
    const store = await openTmpStore('contract_store_test');
    contractStore = new ContractStore(store);
  });

  it('stores a contract artifact', async () => {
    const artifact = BenchmarkingContractArtifact;
    const id = await contractStore.addContractArtifact(artifact);
    await expect(contractStore.getContractArtifact(id)).resolves.toEqual(artifact);
  });

  it('does not store a contract artifact with a duplicate private function selector', async () => {
    const artifact = TestContractArtifact;
    const index = artifact.functions.findIndex(fn => fn.functionType === FunctionType.PRIVATE);

    const copiedFn = structuredClone(artifact.functions[index]);
    artifact.functions.push(copiedFn);

    await expect(contractStore.addContractArtifact(artifact)).rejects.toThrow(
      'Repeated function selectors of private functions',
    );
  });

  it('stores a contract instance', async () => {
    const address = await AztecAddress.random();
    const instance = (await SerializableContractInstance.random()).withAddress(address);
    await contractStore.addContractInstance(instance);
    await expect(contractStore.getContractInstance(address)).resolves.toEqual(instance);
  });

  it('reconstructs contract class with correct preimage fields', async () => {
    const artifact = BenchmarkingContractArtifact;
    const expected = await getContractClassFromArtifact(artifact);
    await contractStore.addContractArtifact(artifact);

    const result = await contractStore.getContractClassWithPreimage(expected.id);
    expect(result).toBeDefined();
    expect(result!.id).toEqual(expected.id);
    expect(result!.artifactHash).toEqual(expected.artifactHash);
    expect(result!.privateFunctionsRoot).toEqual(expected.privateFunctionsRoot);
    expect(result!.publicBytecodeCommitment).toEqual(expected.publicBytecodeCommitment);
    expect(result!.packedBytecode).toEqual(expected.packedBytecode);
    expect(result!.privateFunctions).toHaveLength(expected.privateFunctions.length);
    for (let i = 0; i < expected.privateFunctions.length; i++) {
      expect(result!.privateFunctions[i].selector).toEqual(expected.privateFunctions[i].selector);
      expect(result!.privateFunctions[i].vkHash).toEqual(expected.privateFunctions[i].vkHash);
    }
  });

  it('skips KV write on cache hit', async () => {
    const kvStore = await openTmpStore('contract_store_cache_test');
    const store = new ContractStore(kvStore);
    const spy = jest.spyOn(kvStore, 'transactionAsync');

    const artifact = BenchmarkingContractArtifact;
    await store.addContractArtifact(artifact);
    expect(spy).toHaveBeenCalledTimes(1);

    // Second add of the same artifact should hit the in-memory cache and skip the KV write
    await store.addContractArtifact(artifact);
    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockRestore();
  });
});
