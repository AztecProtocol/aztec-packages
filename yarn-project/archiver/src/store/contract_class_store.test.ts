import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { ProtocolContractClassId } from '@aztec/protocol-contracts';
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

    it('throws if the same contract class is added again at a different block', async () => {
      await expect(
        contractClassStore.addContractClasses([await withCommitment(contractClass)], BlockNumber(blockNum + 1)),
      ).rejects.toThrow(/already exists/);
    });

    it('treats re-adding the same contract class at the same block as a no-op (A-1350)', async () => {
      // An L1 reorg can re-present an already-stored checkpoint, replaying this class at the same block.
      const originalCommitment = await computePublicBytecodeCommitment(contractClass.packedBytecode);
      await expect(
        contractClassStore.addContractClasses([await withCommitment(contractClass)], BlockNumber(blockNum)),
      ).resolves.not.toThrow();
      await expect(contractClassStore.getContractClass(contractClass.id)).resolves.toMatchObject(contractClass);
      await expect(contractClassStore.getBytecodeCommitment(contractClass.id)).resolves.toEqual(originalCommitment);
    });

    it('returns contract class if deleted at a later block number', async () => {
      await contractClassStore.deleteContractClasses([contractClass], BlockNumber(blockNum + 1));
      await expect(contractClassStore.getContractClass(contractClass.id)).resolves.toMatchObject(contractClass);
    });

    it('returns undefined if contract class is not found', async () => {
      await expect(contractClassStore.getContractClass(Fr.random())).resolves.toBeUndefined();
    });
  });

  describe('protocol contract classes (A-1257)', () => {
    // Protocol contracts are preloaded at synthetic block 0. A later on-chain (re-)publish of a
    // bundled protocol class id must be treated as a no-op rather than a hard error, and must never
    // delete the preloaded entry.
    let protocolClass: ContractClassPublic;
    const preloadBlock = 0;

    beforeEach(async () => {
      const base = await makeContractClassPublic();
      protocolClass = { ...base, id: ProtocolContractClassId.ContractClassRegistry };
      await contractClassStore.addContractClasses([await withCommitment(protocolClass)], BlockNumber(preloadBlock));
    });

    it('treats re-publish of a preloaded protocol class as a no-op and keeps it queryable', async () => {
      const originalCommitment = await computePublicBytecodeCommitment(protocolClass.packedBytecode);
      await expect(
        contractClassStore.addContractClasses([await withCommitment(protocolClass)], BlockNumber(50)),
      ).resolves.not.toThrow();
      await expect(contractClassStore.getContractClass(protocolClass.id)).resolves.toMatchObject(protocolClass);
      // The block-0 preload must be left untouched: the re-publish must not clobber the stored bytecode commitment.
      await expect(contractClassStore.getBytecodeCommitment(protocolClass.id)).resolves.toEqual(originalCommitment);
    });

    it('does not delete a protocol class', async () => {
      await contractClassStore.deleteContractClasses([protocolClass], BlockNumber(preloadBlock));
      await expect(contractClassStore.getContractClass(protocolClass.id)).resolves.toMatchObject(protocolClass);
    });

    it('still throws when a non-protocol class is added twice', async () => {
      const nonProtocolClass = await makeContractClassPublic(123);
      await contractClassStore.addContractClasses([await withCommitment(nonProtocolClass)], BlockNumber(10));
      await expect(
        contractClassStore.addContractClasses([await withCommitment(nonProtocolClass)], BlockNumber(11)),
      ).rejects.toThrow(/already exists/);
    });
  });
});
