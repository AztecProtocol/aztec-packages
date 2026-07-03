import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { BenchmarkingContractArtifact } from '@aztec/noir-test-contracts.js/Benchmarking';
import { TestContractArtifact } from '@aztec/noir-test-contracts.js/Test';
import { FunctionSelector, FunctionType } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  SerializableContractInstance,
  SerializableContractInstancePreimage,
  getContractClassFromArtifact,
} from '@aztec/stdlib/contract';

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

  it('stores a contract instance as its address preimage', async () => {
    const address = await AztecAddress.random();
    const instance = (await SerializableContractInstance.random()).withAddress(address);
    await contractStore.addContractInstance(instance);
    const expected = new SerializableContractInstancePreimage(instance).withAddress(address);
    await expect(contractStore.getContractInstance(address)).resolves.toEqual(expected);
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

  describe('function artifact resolution', () => {
    const artifact = BenchmarkingContractArtifact;

    it('returns undefined when the class artifact is not registered', async () => {
      const classId = (await getContractClassFromArtifact(artifact)).id;
      const selector = await FunctionSelector.fromSignature('not_a_real_function()');

      await expect(contractStore.getFunctionArtifact(classId, selector)).resolves.toBeUndefined();
      await expect(contractStore.getFunctionArtifactWithDebugMetadata(classId, selector)).resolves.toBeUndefined();
    });

    it('throws when the selector is absent from a registered artifact', async () => {
      const classId = await contractStore.addContractArtifact(artifact);
      const missingSelector = await FunctionSelector.fromSignature('not_a_real_function()');
      // Inconsistency: the artifact is present but lacks the selector, so the registered artifact does not match the
      // resolved class id. That is not a normal "not found", so it throws rather than returning undefined.
      await expect(contractStore.getFunctionArtifact(classId, missingSelector)).rejects.toThrow(
        'does not match the class id',
      );
      await expect(contractStore.getFunctionArtifactWithDebugMetadata(classId, missingSelector)).rejects.toThrow(
        'does not match the class id',
      );
    });

    it('returns the function artifact when the selector is present', async () => {
      const classId = await contractStore.addContractArtifact(artifact);
      const fn = artifact.functions.find(f => f.functionType === FunctionType.PRIVATE)!;
      const selector = await FunctionSelector.fromNameAndParameters(fn.name, fn.parameters);
      await expect(contractStore.getFunctionArtifact(classId, selector)).resolves.toMatchObject({
        name: fn.name,
        contractName: artifact.name,
      });
    });
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
