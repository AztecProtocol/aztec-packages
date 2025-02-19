import {
  AztecAddress,
  type ContractClassPublic,
  type ContractInstanceWithAddress,
  FunctionSelector,
  PUBLIC_DISPATCH_SELECTOR,
  ScheduledDelayChange,
  ScheduledValueChange,
  UPDATED_CLASS_IDS_SLOT,
  UPDATES_SCHEDULED_VALUE_CHANGE_LEN,
  computeSharedMutableHashSlot,
} from '@aztec/circuits.js';
import { deriveStorageSlotInMap } from '@aztec/circuits.js/hash';
import { makeContractClassPublic, makeContractInstanceFromClassId } from '@aztec/circuits.js/testing';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { AvmTestContractArtifact } from '@aztec/noir-contracts.js/AvmTest';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { DEFAULT_BLOCK_NUMBER, getAvmTestContractBytecode } from '@aztec/simulator/public/fixtures';

import { AvmProvingTester } from './avm_proving_tester.js';

const TIMEOUT = 300_000;
const DISPATCH_FN_NAME = 'public_dispatch';
const DISPATCH_SELECTOR = new FunctionSelector(PUBLIC_DISPATCH_SELECTOR);

describe('AVM WitGen & Circuit - contract updates', () => {
  const sender = AztecAddress.fromNumber(42);

  const avmTestContractClassSeed = 0;
  const avmTestContractBytecode = getAvmTestContractBytecode(DISPATCH_FN_NAME);
  let avmTestContractClass: ContractClassPublic;
  let avmTestContractInstance: ContractInstanceWithAddress;

  beforeEach(async () => {
    avmTestContractClass = await makeContractClassPublic(
      /*seed=*/ avmTestContractClassSeed,
      /*publicDispatchFunction=*/ { bytecode: avmTestContractBytecode, selector: DISPATCH_SELECTOR },
    );
  });

  const writeContractUpdate = async (
    tester: AvmProvingTester,
    contractAddress: AztecAddress,
    previousClassId: Fr,
    nextClassId: Fr,
    blockOfChange: number,
  ) => {
    const sharedMutableSlot = await deriveStorageSlotInMap(new Fr(UPDATED_CLASS_IDS_SLOT), contractAddress);

    const valueChange = new ScheduledValueChange([previousClassId], [nextClassId], blockOfChange);
    const delayChange = ScheduledDelayChange.empty();
    const writeToTree = async (storageSlot: Fr, value: Fr) => {
      await tester.setPublicStorage(ProtocolContractAddress.ContractInstanceDeployer, storageSlot, value);
    };
    await valueChange.writeToTree(sharedMutableSlot, writeToTree);
    await delayChange.writeToTree(sharedMutableSlot, writeToTree);

    const updatePreimage = [delayChange.toField(), ...valueChange.toFields()];
    const updateHash = await poseidon2Hash(updatePreimage);

    const hashSlot = computeSharedMutableHashSlot(sharedMutableSlot, UPDATES_SCHEDULED_VALUE_CHANGE_LEN);

    await writeToTree(hashSlot, updateHash);
  };

  it(
    'should execute an updated contract',
    async () => {
      // Contract was not originally the avmTestContract
      const originalClassId = new Fr(27);
      avmTestContractInstance = await makeContractInstanceFromClassId(
        originalClassId,
        /*seed=*/ avmTestContractClassSeed,
        {
          currentClassId: avmTestContractClass.id,
        },
      );
      const tester = await AvmProvingTester.create(/*checkCircuitOnly*/ true);
      await tester.addContractClass(avmTestContractClass, AvmTestContractArtifact);
      await tester.addContractInstance(avmTestContractInstance);
      await writeContractUpdate(
        tester,
        avmTestContractInstance.address,
        avmTestContractInstance.originalContractClassId,
        avmTestContractInstance.currentContractClassId,
        DEFAULT_BLOCK_NUMBER,
      );

      await tester.simProveVerify(
        sender,
        /*setupCalls=*/ [],
        /*appCalls=*/ [
          { address: avmTestContractInstance.address, fnName: 'add_args_return', args: [new Fr(1), new Fr(2)] },
        ],
        /*teardownCall=*/ undefined,
        /*expectRevert=*/ false,
      );
    },
    TIMEOUT,
  );

  it(
    'should fail if trying to execute an updated contract which has not been updated yet',
    async () => {
      // Contract was not originally the avmTestContract
      const originalClassId = new Fr(27);
      avmTestContractInstance = await makeContractInstanceFromClassId(
        originalClassId,
        /*seed=*/ avmTestContractClassSeed,
        {
          currentClassId: avmTestContractClass.id,
        },
      );
      const tester = await AvmProvingTester.create(/*checkCircuitOnly*/ true);
      await tester.addContractClass(avmTestContractClass, AvmTestContractArtifact);
      await tester.addContractInstance(avmTestContractInstance);
      await writeContractUpdate(
        tester,
        avmTestContractInstance.address,
        avmTestContractInstance.originalContractClassId,
        avmTestContractInstance.currentContractClassId,
        DEFAULT_BLOCK_NUMBER + 1,
      );

      await expect(
        tester.simProveVerify(
          sender,
          /*setupCalls=*/ [],
          /*appCalls=*/ [
            { address: avmTestContractInstance.address, fnName: 'add_args_return', args: [new Fr(1), new Fr(2)] },
          ],
          /*teardownCall=*/ undefined,
          /*expectRevert=*/ false,
        ),
      ).rejects.toThrow();
    },
    TIMEOUT,
  );

  it(
    'should execute a not yet updated contract',
    async () => {
      // Contract was not originally the avmTestContract
      const newClassId = new Fr(27);
      avmTestContractInstance = await makeContractInstanceFromClassId(
        avmTestContractClass.id,
        /*seed=*/ avmTestContractClassSeed,
      );
      const tester = await AvmProvingTester.create(/*checkCircuitOnly*/ true);
      await tester.addContractClass(avmTestContractClass, AvmTestContractArtifact);
      await tester.addContractInstance(avmTestContractInstance);
      await writeContractUpdate(
        tester,
        avmTestContractInstance.address,
        avmTestContractInstance.currentContractClassId,
        newClassId,
        DEFAULT_BLOCK_NUMBER + 1,
      );

      await tester.simProveVerify(
        sender,
        /*setupCalls=*/ [],
        /*appCalls=*/ [
          { address: avmTestContractInstance.address, fnName: 'add_args_return', args: [new Fr(1), new Fr(2)] },
        ],
        /*teardownCall=*/ undefined,
        /*expectRevert=*/ false,
      );
    },
    TIMEOUT,
  );

  it(
    'should fail if trying to execute the old class of a contract which has been updated already',
    async () => {
      // Contract was not originally the avmTestContract
      const newClassId = new Fr(27);
      avmTestContractInstance = await makeContractInstanceFromClassId(
        avmTestContractClass.id,
        /*seed=*/ avmTestContractClassSeed,
      );
      const tester = await AvmProvingTester.create(/*checkCircuitOnly*/ true);
      await tester.addContractClass(avmTestContractClass, AvmTestContractArtifact);
      await tester.addContractInstance(avmTestContractInstance);
      await writeContractUpdate(
        tester,
        avmTestContractInstance.address,
        avmTestContractInstance.currentContractClassId,
        newClassId,
        DEFAULT_BLOCK_NUMBER - 1,
      );

      await expect(
        tester.simProveVerify(
          sender,
          /*setupCalls=*/ [],
          /*appCalls=*/ [
            { address: avmTestContractInstance.address, fnName: 'add_args_return', args: [new Fr(1), new Fr(2)] },
          ],
          /*teardownCall=*/ undefined,
          /*expectRevert=*/ false,
        ),
      ).rejects.toThrow();
    },
    TIMEOUT,
  );
});
