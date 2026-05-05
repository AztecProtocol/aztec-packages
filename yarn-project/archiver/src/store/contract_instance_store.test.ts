import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { type ContractInstanceWithAddress, SerializableContractInstance } from '@aztec/stdlib/contract';
import '@aztec/stdlib/testing/jest';

import { ContractInstanceStore } from './contract_instance_store.js';

describe('ContractInstanceStore', () => {
  let contractInstanceStore: ContractInstanceStore;

  beforeEach(async () => {
    contractInstanceStore = new ContractInstanceStore(await openTmpStore('contract_instance_store_test'));
  });

  describe('contractInstances', () => {
    let contractInstance: ContractInstanceWithAddress;
    const blockNum = 10;
    const timestamp = 3600n;

    beforeEach(async () => {
      const classId = Fr.random();
      const randomInstance = await SerializableContractInstance.random({
        currentContractClassId: classId,
        originalContractClassId: classId,
      });
      contractInstance = { ...randomInstance, address: await AztecAddress.random() };
      await contractInstanceStore.addContractInstances([contractInstance], BlockNumber(blockNum));
    });

    it('returns previously stored contract instances', async () => {
      await expect(
        contractInstanceStore.getContractInstance(contractInstance.address, timestamp),
      ).resolves.toMatchObject(contractInstance);
    });

    it('returns undefined if contract instance is not found', async () => {
      await expect(
        contractInstanceStore.getContractInstance(await AztecAddress.random(), timestamp),
      ).resolves.toBeUndefined();
    });

    it('returns undefined if previously stored contract instances was deleted', async () => {
      await contractInstanceStore.deleteContractInstances([contractInstance]);
      await expect(
        contractInstanceStore.getContractInstance(contractInstance.address, timestamp),
      ).resolves.toBeUndefined();
    });

    it('throws when adding the same contract instance twice', async () => {
      await expect(contractInstanceStore.addContractInstances([contractInstance], BlockNumber(2))).rejects.toThrow(
        /already exists/,
      );
    });
  });

  describe('contractInstanceUpdates', () => {
    let contractInstance: ContractInstanceWithAddress;
    let classId: Fr;
    let nextClassId: Fr;
    const timestampOfChange = 3600n;

    beforeEach(async () => {
      classId = Fr.random();
      nextClassId = Fr.random();
      const randomInstance = await SerializableContractInstance.random({
        currentContractClassId: classId,
        originalContractClassId: classId,
      });
      contractInstance = { ...randomInstance, address: await AztecAddress.random() };
      await contractInstanceStore.addContractInstances([contractInstance], BlockNumber(1));
      await contractInstanceStore.addContractInstanceUpdates(
        [
          {
            prevContractClassId: classId,
            newContractClassId: nextClassId,
            timestampOfChange,
            address: contractInstance.address,
          },
        ],
        timestampOfChange - 1n,
      );
    });

    it('gets the correct current class id for a contract not updated yet', async () => {
      const fetchedInstance = await contractInstanceStore.getContractInstance(
        contractInstance.address,
        timestampOfChange - 1n,
      );
      expect(fetchedInstance?.originalContractClassId).toEqual(classId);
      expect(fetchedInstance?.currentContractClassId).toEqual(classId);
    });

    it('gets the correct current class id for a contract that has just been updated', async () => {
      const fetchedInstance = await contractInstanceStore.getContractInstance(
        contractInstance.address,
        timestampOfChange,
      );
      expect(fetchedInstance?.originalContractClassId).toEqual(classId);
      expect(fetchedInstance?.currentContractClassId).toEqual(nextClassId);
    });

    it('gets the correct current class id for a contract that was updated in the past', async () => {
      const fetchedInstance = await contractInstanceStore.getContractInstance(
        contractInstance.address,
        timestampOfChange + 1n,
      );
      expect(fetchedInstance?.originalContractClassId).toEqual(classId);
      expect(fetchedInstance?.currentContractClassId).toEqual(nextClassId);
    });

    it('ignores updates for the wrong contract', async () => {
      const otherClassId = Fr.random();
      const randomInstance = await SerializableContractInstance.random({
        currentContractClassId: otherClassId,
        originalContractClassId: otherClassId,
      });
      const otherContractInstance = {
        ...randomInstance,
        address: await AztecAddress.random(),
      };
      await contractInstanceStore.addContractInstances([otherContractInstance], BlockNumber(1));

      const fetchedInstance = await contractInstanceStore.getContractInstance(
        otherContractInstance.address,
        timestampOfChange + 1n,
      );
      expect(fetchedInstance?.originalContractClassId).toEqual(otherClassId);
      expect(fetchedInstance?.currentContractClassId).toEqual(otherClassId);
    });

    it('bounds its search to the right contract if more than than one update exists', async () => {
      const otherClassId = Fr.random();
      const otherNextClassId = Fr.random();
      const randomInstance = await SerializableContractInstance.random({
        currentContractClassId: otherClassId,
        originalContractClassId: otherNextClassId,
      });
      const otherContractInstance = {
        ...randomInstance,
        address: await AztecAddress.random(),
      };
      await contractInstanceStore.addContractInstances([otherContractInstance], BlockNumber(1));
      await contractInstanceStore.addContractInstanceUpdates(
        [
          {
            prevContractClassId: otherClassId,
            newContractClassId: otherNextClassId,
            timestampOfChange,
            address: otherContractInstance.address,
          },
        ],
        timestampOfChange - 1n,
      );

      const fetchedInstance = await contractInstanceStore.getContractInstance(
        contractInstance.address,
        timestampOfChange + 1n,
      );
      expect(fetchedInstance?.originalContractClassId).toEqual(classId);
      expect(fetchedInstance?.currentContractClassId).toEqual(nextClassId);
    });
  });
});
