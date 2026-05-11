import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import {
  type ContractClassPublic,
  type ContractClassPublicWithCommitment,
  computePublicBytecodeCommitment,
} from '@aztec/stdlib/contract';
import { makeContractClassPublic } from '@aztec/stdlib/testing';
import '@aztec/stdlib/testing/jest';

import { ContractClassStore } from './contract_class_store.js';

async function withCommitment(contractClass: ContractClassPublic): Promise<ContractClassPublicWithCommitment> {
  return {
    ...contractClass,
    publicBytecodeCommitment: await computePublicBytecodeCommitment(contractClass.packedBytecode),
  };
}

describe('ContractClassStore', () => {
  let contractClassStore: ContractClassStore;

  beforeEach(async () => {
    contractClassStore = new ContractClassStore(await openTmpStore('contract_class_store_test'));
  });

  describe('contractClasses', () => {
    let contractClass: ContractClassPublic;
    const blockNum = 10;

    beforeEach(async () => {
      contractClass = await makeContractClassPublic();
      await contractClassStore.addContractClasses([await withCommitment(contractClass)], BlockNumber(blockNum));
    });

    it('returns previously stored contract class', async () => {
      await expect(contractClassStore.getContractClass(contractClass.id)).resolves.toMatchObject(contractClass);
    });

    it('returns undefined if the initial deployed contract class was deleted', async () => {
      await contractClassStore.deleteContractClasses([contractClass], BlockNumber(blockNum));
      await expect(contractClassStore.getContractClass(contractClass.id)).resolves.toBeUndefined();
    });

    it('throws if the same contract class is added again', async () => {
      await expect(
        contractClassStore.addContractClasses([await withCommitment(contractClass)], BlockNumber(blockNum + 1)),
      ).rejects.toThrow(/already exists/);
    });

    it('returns contract class if deleted at a later block number', async () => {
      await contractClassStore.deleteContractClasses([contractClass], BlockNumber(blockNum + 1));
      await expect(contractClassStore.getContractClass(contractClass.id)).resolves.toMatchObject(contractClass);
    });

    it('returns undefined if contract class is not found', async () => {
      await expect(contractClassStore.getContractClass(Fr.random())).resolves.toBeUndefined();
    });
  });
});
