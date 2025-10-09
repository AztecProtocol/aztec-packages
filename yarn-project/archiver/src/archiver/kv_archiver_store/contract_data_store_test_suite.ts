import { times } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type ContractClassPublic,
  type ContractInstanceWithAddress,
  SerializableContractInstance,
  computePublicBytecodeCommitment,
} from '@aztec/stdlib/contract';
import {
  makeContractClassPublic,
  makeExecutablePrivateFunctionWithMembershipProof,
  makeUtilityFunctionWithMembershipProof,
} from '@aztec/stdlib/testing';
import '@aztec/stdlib/testing/jest';

import type { ContractDataStore } from './contract_data_store.js';

/**
 * @param testName - The name of the test suite.
 * @param getStore - Returns an instance of a store that's already been initialized.
 */
export function describeContractDataStore(
  testName: string,
  getStore: () => ContractDataStore | Promise<ContractDataStore>,
) {
  describe(testName, () => {
    let store: ContractDataStore;

    beforeEach(async () => {
      store = await getStore();
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
        await store.addContractInstances([contractInstance], blockNum);
      });

      it('returns previously stored contract instances', async () => {
        await expect(store.getContractInstance(contractInstance.address, timestamp)).resolves.toMatchObject(
          contractInstance,
        );
      });

      it('returns undefined if contract instance is not found', async () => {
        await expect(store.getContractInstance(await AztecAddress.random(), timestamp)).resolves.toBeUndefined();
      });

      it('returns undefined if previously stored contract instances was deleted', async () => {
        await store.deleteContractInstances([contractInstance], blockNum);
        await expect(store.getContractInstance(contractInstance.address, timestamp)).resolves.toBeUndefined();
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
        await store.addContractInstances([contractInstance], 1);
        await store.addContractInstanceUpdates(
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
        const fetchedInstance = await store.getContractInstance(contractInstance.address, timestampOfChange - 1n);
        expect(fetchedInstance?.originalContractClassId).toEqual(classId);
        expect(fetchedInstance?.currentContractClassId).toEqual(classId);
      });

      it('gets the correct current class id for a contract that has just been updated', async () => {
        const fetchedInstance = await store.getContractInstance(contractInstance.address, timestampOfChange);
        expect(fetchedInstance?.originalContractClassId).toEqual(classId);
        expect(fetchedInstance?.currentContractClassId).toEqual(nextClassId);
      });

      it('gets the correct current class id for a contract that was updated in the past', async () => {
        const fetchedInstance = await store.getContractInstance(contractInstance.address, timestampOfChange + 1n);
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
        await store.addContractInstances([otherContractInstance], 1);

        const fetchedInstance = await store.getContractInstance(otherContractInstance.address, timestampOfChange + 1n);
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
        await store.addContractInstances([otherContractInstance], 1);
        await store.addContractInstanceUpdates(
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

        const fetchedInstance = await store.getContractInstance(contractInstance.address, timestampOfChange + 1n);
        expect(fetchedInstance?.originalContractClassId).toEqual(classId);
        expect(fetchedInstance?.currentContractClassId).toEqual(nextClassId);
      });
    });

    describe('contractClasses', () => {
      let contractClass: ContractClassPublic;
      const blockNum = 10;

      beforeEach(async () => {
        contractClass = await makeContractClassPublic();
        await store.addContractClasses(
          [contractClass],
          [await computePublicBytecodeCommitment(contractClass.packedBytecode)],
          blockNum,
        );
      });

      it('returns previously stored contract class', async () => {
        await expect(store.getContractClass(contractClass.id)).resolves.toMatchObject(contractClass);
      });

      it('returns undefined if the initial deployed contract class was deleted', async () => {
        await store.deleteContractClasses([contractClass], blockNum);
        await expect(store.getContractClass(contractClass.id)).resolves.toBeUndefined();
      });

      it('returns contract class if later "deployment" class was deleted', async () => {
        await store.addContractClasses(
          [contractClass],
          [await computePublicBytecodeCommitment(contractClass.packedBytecode)],
          blockNum + 1,
        );
        await store.deleteContractClasses([contractClass], blockNum + 1);
        await expect(store.getContractClass(contractClass.id)).resolves.toMatchObject(contractClass);
      });

      it('returns undefined if contract class is not found', async () => {
        await expect(store.getContractClass(Fr.random())).resolves.toBeUndefined();
      });

      it('adds new private functions', async () => {
        const fns = times(3, makeExecutablePrivateFunctionWithMembershipProof);
        await store.addFunctions(contractClass.id, fns, []);
        const stored = await store.getContractClass(contractClass.id);
        expect(stored?.privateFunctions).toEqual(fns);
      });

      it('does not duplicate private functions', async () => {
        const fns = times(3, makeExecutablePrivateFunctionWithMembershipProof);
        await store.addFunctions(contractClass.id, fns.slice(0, 1), []);
        await store.addFunctions(contractClass.id, fns, []);
        const stored = await store.getContractClass(contractClass.id);
        expect(stored?.privateFunctions).toEqual(fns);
      });

      it('adds new utility functions', async () => {
        const fns = times(3, makeUtilityFunctionWithMembershipProof);
        await store.addFunctions(contractClass.id, [], fns);
        const stored = await store.getContractClass(contractClass.id);
        expect(stored?.utilityFunctions).toEqual(fns);
      });

      it('does not duplicate utility functions', async () => {
        const fns = times(3, makeUtilityFunctionWithMembershipProof);
        await store.addFunctions(contractClass.id, [], fns.slice(0, 1));
        await store.addFunctions(contractClass.id, [], fns);
        const stored = await store.getContractClass(contractClass.id);
        expect(stored?.utilityFunctions).toEqual(fns);
      });
    });
  });
}
