import { Fr } from '@aztec/foundation/fields';
import { AvmTestContractArtifact } from '@aztec/noir-test-contracts.js/AvmTest';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { defaultGlobals } from '@aztec/simulator/public/fixtures';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import {
  DelayedPublicMutableValuesWithHash,
  ScheduledDelayChange,
  ScheduledValueChange,
} from '@aztec/stdlib/delayed-public-mutable';
import type { UInt64 } from '@aztec/stdlib/types';

import { AvmProvingTester } from './avm_proving_tester.js';

const TIMEOUT = 300_000;

describe.skip('AVM WitGen & Circuit - contract updates', () => {
  const sender = AztecAddress.fromNumber(42);

  const avmTestContractClassSeed = 0;
  let avmTestContractInstance: ContractInstanceWithAddress;

  beforeEach(async () => {});

  const writeContractUpdate = async (
    tester: AvmProvingTester,
    contractAddress: AztecAddress,
    previousClassId: Fr,
    nextClassId: Fr,
    timestampOfChange: UInt64,
  ) => {
    const { delayedPublicMutableSlot } =
      await DelayedPublicMutableValuesWithHash.getContractUpdateSlots(contractAddress);

    const valueChange = new ScheduledValueChange([previousClassId], [nextClassId], timestampOfChange);
    const delayChange = ScheduledDelayChange.empty();
    const delayedPublicMutableValuesWithHash = new DelayedPublicMutableValuesWithHash(valueChange, delayChange);

    const writeToTree = async (storageSlot: Fr, value: Fr) => {
      await tester.setPublicStorage(ProtocolContractAddress.ContractInstanceDeployer, storageSlot, value);
    };

    await delayedPublicMutableValuesWithHash.writeToTree(delayedPublicMutableSlot, writeToTree);
  };

  it(
    'should execute an updated contract',
    async () => {
      // Contract was not originally the avmTestContract
      const originalClassId = new Fr(27);
      const globals = defaultGlobals();
      const tester = await AvmProvingTester.new(/*checkCircuitOnly*/ true, globals);

      avmTestContractInstance = await tester.registerAndDeployContract(
        /*constructorArgs=*/ [],
        sender,
        /*contractArtifact=*/ AvmTestContractArtifact,
        /*skipNullifierInsertion=*/ false,
        /*seed=*/ avmTestContractClassSeed,
        /*originalContractClassId=*/ originalClassId, // upgraded from
      );

      await writeContractUpdate(
        tester,
        avmTestContractInstance.address,
        avmTestContractInstance.originalContractClassId,
        avmTestContractInstance.currentContractClassId,
        globals.timestamp,
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
      const globals = defaultGlobals();
      const tester = await AvmProvingTester.new(/*checkCircuitOnly*/ true, globals);
      avmTestContractInstance = await tester.registerAndDeployContract(
        /*constructorArgs=*/ [],
        sender,
        /*contractArtifact=*/ AvmTestContractArtifact,
        /*skipNullifierInsertion=*/ false,
        /*seed=*/ avmTestContractClassSeed,
        /*originalContractClassId=*/ originalClassId, // upgraded from
      );

      await writeContractUpdate(
        tester,
        avmTestContractInstance.address,
        avmTestContractInstance.originalContractClassId,
        avmTestContractInstance.currentContractClassId,
        globals.timestamp + 1n,
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

      const globals = defaultGlobals();
      const tester = await AvmProvingTester.new(/*checkCircuitOnly*/ true, globals);
      avmTestContractInstance = await tester.registerAndDeployContract(
        /*constructorArgs=*/ [],
        sender,
        /*contractArtifact=*/ AvmTestContractArtifact,
        /*skipNullifierInsertion=*/ false,
        /*seed=*/ avmTestContractClassSeed,
      );

      await writeContractUpdate(
        tester,
        avmTestContractInstance.address,
        avmTestContractInstance.currentContractClassId,
        newClassId,
        globals.timestamp + 1n,
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

      const globals = defaultGlobals();
      const tester = await AvmProvingTester.new(/*checkCircuitOnly*/ true, globals);
      avmTestContractInstance = await tester.registerAndDeployContract(
        /*constructorArgs=*/ [],
        sender,
        /*contractArtifact=*/ AvmTestContractArtifact,
        /*skipNullifierInsertion=*/ false,
        /*seed=*/ avmTestContractClassSeed,
      );

      await writeContractUpdate(
        tester,
        avmTestContractInstance.address,
        avmTestContractInstance.currentContractClassId,
        newClassId,
        globals.timestamp - 1n,
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
