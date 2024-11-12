import {
  type PXE,
  randomContractArtifact,
  randomContractInstanceWithAddress,
  randomDeployedContract,
} from '@aztec/circuit-types';
import { AztecAddress, Fr, INITIAL_L2_BLOCK_NUM, getContractClassFromArtifact } from '@aztec/circuits.js';

import omit from 'lodash.omit';

export const pxeTestSuite = (testName: string, pxeSetup: () => Promise<PXE>) => {
  describe(testName, () => {
    let pxe: PXE;

    beforeAll(async () => {
      pxe = await pxeSetup();
    }, 120_000);

    it('registers an account and returns it as an account only and not as a recipient', async () => {
      const randomSecretKey = Fr.random();
      const randomPartialAddress = Fr.random();
      const completeAddress = await pxe.registerAccount(randomSecretKey, randomPartialAddress);

      // Check that the account is correctly registered using the getAccounts and getRecipients methods
      const accounts = await pxe.getRegisteredAccounts();
      expect(accounts).toContainEqual(completeAddress);

      // Check that the account is correctly registered using the getAccount and getRecipient methods
      const account = await pxe.getRegisteredAccount(completeAddress.address);
      expect(account).toEqual(completeAddress);
    });

    it('does not throw when registering the same account twice (just ignores the second attempt)', async () => {
      const randomSecretKey = Fr.random();
      const randomPartialAddress = Fr.random();

      await pxe.registerAccount(randomSecretKey, randomPartialAddress);
      await pxe.registerAccount(randomSecretKey, randomPartialAddress);
    });

    it('successfully adds a contract', async () => {
      const contracts = [randomDeployedContract(), randomDeployedContract()];
      for (const contract of contracts) {
        await pxe.registerContract(contract);
      }

      const expectedContractAddresses = contracts.map(contract => contract.instance.address);
      const contractAddresses = await pxe.getContracts();
      expect(contractAddresses).toEqual(expect.arrayContaining(expectedContractAddresses));
    });

    it('registers a class and adds a contract for it', async () => {
      const artifact = randomContractArtifact();
      const contractClass = getContractClassFromArtifact(artifact);
      const contractClassId = contractClass.id;
      const instance = randomContractInstanceWithAddress({ contractClassId });

      await pxe.registerContractClass(artifact);
      expect(await pxe.getContractClass(contractClassId)).toMatchObject(
        omit(contractClass, 'privateFunctionsRoot', 'publicBytecodeCommitment'),
      );

      await pxe.registerContract({ instance });
      expect(await pxe.getContractInstance(instance.address)).toEqual(instance);
    });

    it('refuses to register a class with a mismatched address', async () => {
      const artifact = randomContractArtifact();
      const contractClass = getContractClassFromArtifact(artifact);
      const contractClassId = contractClass.id;
      const instance = randomContractInstanceWithAddress({ contractClassId });
      await expect(
        pxe.registerContract({
          instance: {
            ...instance,
            address: AztecAddress.random(),
          },
          artifact,
        }),
      ).rejects.toThrow(/Added a contract in which the address does not match the contract instance./);
    });

    it('refuses to register a contract with a class that has not been registered', async () => {
      const instance = randomContractInstanceWithAddress();
      await expect(pxe.registerContract({ instance })).rejects.toThrow(/Missing contract artifact/i);
    });

    it('refuses to register a contract with an artifact with mismatching class id', async () => {
      const artifact = randomContractArtifact();
      const instance = randomContractInstanceWithAddress();
      await expect(pxe.registerContract({ instance, artifact })).rejects.toThrow(/Artifact does not match/i);
    });

    // Note: Not testing a successful run of `proveTx`, `sendTx`, `getTxReceipt` and `simulateUnconstrained` here as it requires
    //       a larger setup and it's sufficiently tested in the e2e tests.

    it('throws when getting public storage for non-existent contract', async () => {
      const contract = AztecAddress.random();
      await expect(async () => await pxe.getPublicStorageAt(contract, new Fr(0n))).rejects.toThrow(
        `Contract ${contract.toString()} is not deployed`,
      );
    });

    // Note: Not testing `getContractData` and `getUnencryptedLogs` here as these
    //       functions only call AztecNode and these methods are frequently used by the e2e tests.

    it('successfully gets a block number', async () => {
      const blockNum = await pxe.getBlockNumber();
      expect(blockNum).toBeGreaterThanOrEqual(INITIAL_L2_BLOCK_NUM);
    });

    it('successfully gets node info', async () => {
      const nodeInfo = await pxe.getNodeInfo();
      expect(typeof nodeInfo.protocolVersion).toEqual('number');
      expect(typeof nodeInfo.l1ChainId).toEqual('number');
      expect(nodeInfo.l1ContractAddresses.rollupAddress.toString()).toMatch(/0x[a-fA-F0-9]+/);
    });

    // Note: Not testing `isGlobalStateSynchronized`, `isAccountStateSynchronized` and `getSyncStatus` as these methods
    //       only call synchronizer.
  });
};
