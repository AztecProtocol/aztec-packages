import { AztecAddress, CompleteAddress, Fr } from '@aztec/circuits.js';
import { Grumpkin } from '@aztec/circuits.js/barretenberg';
import { ConstantKeyPair } from '@aztec/key-store';
import { AztecRPC, DeployedContract, randomDeployedContract } from '@aztec/types';

export const aztecRpcTestSuite = (testName: string, aztecRpcSetup: () => Promise<AztecRPC>) => {
  describe(testName, function () {
    let rpc: AztecRPC;

    beforeAll(async () => {
      rpc = await aztecRpcSetup();
    }, 120_000);

    it('registers an account and returns it as an account only and not as a recipient', async () => {
      const keyPair = ConstantKeyPair.random(await Grumpkin.new());
      const completeAddress = await CompleteAddress.fromPrivateKey(await keyPair.getPrivateKey());

      await rpc.registerAccount(await keyPair.getPrivateKey(), completeAddress);

      // Check that the account is correctly registered using the getAccounts and getRecipients methods
      const accounts = await rpc.getAccounts();
      const recipients = await rpc.getRecipients();
      expect(accounts).toContainEqual(completeAddress);
      expect(recipients).not.toContainEqual(completeAddress);

      // Check that the account is correctly registered using the getAccount and getRecipient methods
      const account = await rpc.getAccount(completeAddress.address);
      const recipient = await rpc.getRecipient(completeAddress.address);
      expect(account).toEqual(completeAddress);
      expect(recipient).toBeUndefined();
    });

    it('registers a recipient and returns it as a recipient only and not as an account', async () => {
      const completeAddress = await CompleteAddress.random();

      await rpc.registerRecipient(completeAddress);

      // Check that the recipient is correctly registered using the getAccounts and getRecipients methods
      const accounts = await rpc.getAccounts();
      const recipients = await rpc.getRecipients();
      expect(accounts).not.toContainEqual(completeAddress);
      expect(recipients).toContainEqual(completeAddress);

      // Check that the recipient is correctly registered using the getAccount and getRecipient methods
      const account = await rpc.getAccount(completeAddress.address);
      const recipient = await rpc.getRecipient(completeAddress.address);
      expect(account).toBeUndefined();
      expect(recipient).toEqual(completeAddress);
    });

    it('cannot register the same account twice', async () => {
      const keyPair = ConstantKeyPair.random(await Grumpkin.new());
      const completeAddress = await CompleteAddress.fromPrivateKey(await keyPair.getPrivateKey());

      await rpc.registerAccount(await keyPair.getPrivateKey(), completeAddress);
      await expect(async () => rpc.registerAccount(await keyPair.getPrivateKey(), completeAddress)).rejects.toThrow(
        `Complete address corresponding to ${completeAddress.address} already exists`,
      );
    });

    it('cannot register the same recipient twice', async () => {
      const completeAddress = await CompleteAddress.random();

      await rpc.registerRecipient(completeAddress);
      await expect(() => rpc.registerRecipient(completeAddress)).rejects.toThrow(
        `Complete address corresponding to ${completeAddress.address} already exists`,
      );
    });

    it('throws when getting public storage for non-existent contract', async () => {
      const contract = AztecAddress.random();
      await expect(async () => await rpc.getPublicStorageAt(contract, new Fr(0n))).rejects.toThrow(
        `Contract ${contract.toString()} is not deployed`,
      );
    });

    it('successfully adds a contract', async () => {
      const contracts: DeployedContract[] = [randomDeployedContract(), randomDeployedContract()];
      await rpc.addContracts(contracts);

      const expectedContractAddresses = contracts.map(contract => contract.address);
      const contractAddresses = await rpc.getContracts();

      // check if all the contracts were returned
      expect(contractAddresses).toEqual(expect.arrayContaining(expectedContractAddresses));
    });
  });
};
