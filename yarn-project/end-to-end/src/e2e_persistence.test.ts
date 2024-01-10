import { getUnsafeSchnorrAccount, getUnsafeSchnorrWallet } from '@aztec/accounts/single_key';
import { AccountWallet, waitForAccountSynch } from '@aztec/aztec.js';
import { CompleteAddress, EthAddress, Fq, Fr } from '@aztec/circuits.js';
import { DeployL1Contracts } from '@aztec/ethereum';
import { EasyPrivateTokenContract } from '@aztec/noir-contracts/EasyPrivateToken';

import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { EndToEndContext, setup } from './fixtures/utils.js';

describe('Aztec persistence', () => {
  let dataDirectory: string;

  let contract: EasyPrivateTokenContract;
  let contractAddress: CompleteAddress;

  let ownerPrivateKey: Fq;
  let ownerAddress: CompleteAddress;
  let ownerWallet: AccountWallet;

  let deployL1ContractsValues: DeployL1Contracts;
  let context: EndToEndContext;

  // deploy L1 contracts, start initial node & PXE, deploy test contract & shutdown node and PXE
  beforeAll(async () => {
    dataDirectory = await mkdtemp(join(tmpdir(), 'aztec-node-'));

    const initialContext = await setup(0, { dataDirectory }, { dataDirectory });
    deployL1ContractsValues = initialContext.deployL1ContractsValues;

    ownerPrivateKey = Fq.random();
    ownerWallet = await getUnsafeSchnorrAccount(initialContext.pxe, ownerPrivateKey, Fr.ZERO).waitDeploy();
    ownerAddress = ownerWallet.getCompleteAddress();

    const deployer = EasyPrivateTokenContract.deploy(ownerWallet, 1000n, ownerWallet.getAddress());
    await deployer.simulate({});

    contract = await deployer.send().deployed();
    contractAddress = contract.completeAddress;

    await initialContext.teardown();
  }, 100_000);

  // ie we were shutdown and now starting back up. Sync should be ~instant
  describe('when restarting the node and PXE with previous data', () => {
    beforeEach(async () => {
      context = await setup(0, { dataDirectory, deployL1ContractsValues }, { dataDirectory });

      ownerWallet = await getUnsafeSchnorrWallet(context.pxe, ownerAddress.address, ownerPrivateKey);
      contract = await EasyPrivateTokenContract.at(contractAddress.address, ownerWallet);
    });

    afterEach(async () => {
      await context.teardown();
    });

    it('correctly restores balances', async () => {
      // test for >0 instead of exact value so test isn't dependent on run order
      await expect(contract.methods.getBalance(ownerWallet.getAddress()).view()).resolves.toBeGreaterThan(0n);
    });

    it('tracks new notes for the owner', async () => {
      const balance = await contract.methods.getBalance(ownerWallet.getAddress()).view();
      await contract.methods.mint(1000n, ownerWallet.getAddress()).send().wait();
      await expect(contract.methods.getBalance(ownerWallet.getAddress()).view()).resolves.toEqual(balance + 1000n);
    });

    it('allows transfers of tokens from owner', async () => {
      const targetWallet = await getUnsafeSchnorrAccount(context.pxe, Fq.random(), Fr.ZERO).waitDeploy();

      const initialOwnerBalance = await contract.methods.getBalance(ownerWallet.getAddress()).view();
      await contract.methods.transfer(500n, ownerWallet.getAddress(), targetWallet.getAddress()).send().wait();
      const [ownerBalance, targetBalance] = await Promise.all([
        contract.methods.getBalance(ownerWallet.getAddress()).view(),
        contract.methods.getBalance(targetWallet.getAddress()).view(),
      ]);

      expect(ownerBalance).toEqual(initialOwnerBalance - 500n);
      expect(targetBalance).toEqual(500n);
    });
  });

  describe('when starting a new node and PXE without previous data', () => {
    // increase timeout since this would require a full node sync
    beforeEach(async () => {
      context = await setup(0, { deployL1ContractsValues }, {});
    }, 50_000);

    afterEach(async () => {
      await context.teardown();
    });

    it('pxe does not have the owner account', async () => {
      await expect(context.pxe.getRecipient(ownerAddress.address)).resolves.toBeUndefined();
    });

    it('the node has the contract', async () => {
      await expect(context.aztecNode.getContractData(contractAddress.address)).resolves.toBeDefined();
    });

    it('pxe does not know of the deployed contract', async () => {
      await context.pxe.registerRecipient(ownerAddress);

      const wallet = await getUnsafeSchnorrAccount(context.pxe, Fq.random(), Fr.ZERO).waitDeploy();
      const contract = await EasyPrivateTokenContract.at(contractAddress.address, wallet);
      await expect(contract.methods.getBalance(ownerAddress.address).view()).rejects.toThrowError(/Unknown contract/);
    });

    it("pxe does not have owner's notes", async () => {
      await context.pxe.addContracts([
        {
          artifact: EasyPrivateTokenContract.artifact,
          completeAddress: contractAddress,
          portalContract: EthAddress.ZERO,
        },
      ]);
      await context.pxe.registerRecipient(ownerAddress);

      const wallet = await getUnsafeSchnorrAccount(context.pxe, Fq.random(), Fr.ZERO).waitDeploy();
      const contract = await EasyPrivateTokenContract.at(contractAddress.address, wallet);
      await expect(contract.methods.getBalance(ownerAddress.address).view()).resolves.toEqual(0n);
    });

    it('pxe restores notes after registering the owner', async () => {
      await context.pxe.addContracts([
        {
          artifact: EasyPrivateTokenContract.artifact,
          completeAddress: contractAddress,
          portalContract: EthAddress.ZERO,
        },
      ]);

      await context.pxe.registerAccount(ownerPrivateKey, ownerAddress.partialAddress);
      const ownerWallet = await getUnsafeSchnorrAccount(context.pxe, ownerPrivateKey, ownerAddress).getWallet();
      const contract = await EasyPrivateTokenContract.at(contractAddress.address, ownerWallet);
      await waitForAccountSynch(context.pxe, ownerAddress, { interval: 1, timeout: 10 });
      await expect(contract.methods.getBalance(ownerAddress.address).view()).resolves.toEqual(1500n);
    });
  });

  describe('when connecting a PXE to a new node', () => {
    beforeEach(async () => {
      context = await setup(0, { deployL1ContractsValues }, { dataDirectory });

      ownerWallet = await getUnsafeSchnorrWallet(context.pxe, ownerAddress.address, ownerPrivateKey);
      contract = await EasyPrivateTokenContract.at(contractAddress.address, ownerWallet);
    }, 50_000);

    afterEach(async () => {
      await context.teardown();
    });

    it('correctly restores balances', async () => {
      await expect(contract.methods.getBalance(ownerWallet.getAddress()).view()).resolves.toEqual(1500n);
    });

    it('tracks new notes for the owner', async () => {
      await contract.methods.mint(1000n, ownerWallet.getAddress()).send().wait();
      await expect(contract.methods.getBalance(ownerWallet.getAddress()).view()).resolves.toEqual(2500n);
    });

    it('allows transfers of tokens from owner', async () => {
      const targetWallet = await getUnsafeSchnorrAccount(context.pxe, Fq.random(), Fr.ZERO).waitDeploy();

      await contract.methods.transfer(500n, ownerWallet.getAddress(), targetWallet.getAddress()).send().wait();

      const [ownerBalance, targetBalance] = await Promise.all([
        contract.methods.getBalance(ownerWallet.getAddress()).view(),
        contract.methods.getBalance(targetWallet.getAddress()).view(),
      ]);

      expect(ownerBalance).toEqual(2000n);
      expect(targetBalance).toEqual(500n);
    }, 25_000);
  });

  describe('when connecting a new PXE to a node with synced data', () => {
    beforeEach(async () => {
      context = await setup(0, { dataDirectory, deployL1ContractsValues }, {});
    });

    afterEach(async () => {
      await context.teardown();
    });

    it('does not restore previous accounts', async () => {
      await expect(context.pxe.getRecipient(ownerAddress.address)).resolves.toBeUndefined();
    });

    it('the node has the contract', async () => {
      await expect(context.aztecNode.getContractData(contractAddress.address)).resolves.toBeDefined();
    });

    it('pxe does not know of the deployed contract', async () => {
      await context.pxe.registerRecipient(ownerAddress);

      const wallet = await getUnsafeSchnorrAccount(context.pxe, Fq.random(), Fr.ZERO).waitDeploy();
      const contract = await EasyPrivateTokenContract.at(contractAddress.address, wallet);
      await expect(contract.methods.getBalance(ownerAddress.address).view()).rejects.toThrowError(/Unknown contract/);
    });

    it("pxe does not have owner's notes", async () => {
      await context.pxe.addContracts([
        {
          artifact: EasyPrivateTokenContract.artifact,
          completeAddress: contractAddress,
          portalContract: EthAddress.ZERO,
        },
      ]);
      await context.pxe.registerRecipient(ownerAddress);

      const wallet = await getUnsafeSchnorrAccount(context.pxe, Fq.random(), Fr.ZERO).waitDeploy();
      const contract = await EasyPrivateTokenContract.at(contractAddress.address, wallet);
      await expect(contract.methods.getBalance(ownerAddress.address).view()).resolves.toEqual(0n);
    });

    it('pxe restores notes after registering the owner', async () => {
      await context.pxe.addContracts([
        {
          artifact: EasyPrivateTokenContract.artifact,
          completeAddress: contractAddress,
          portalContract: EthAddress.ZERO,
        },
      ]);

      await context.pxe.registerAccount(ownerPrivateKey, ownerAddress.partialAddress);
      const ownerWallet = await getUnsafeSchnorrAccount(context.pxe, ownerPrivateKey, ownerAddress).getWallet();
      const contract = await EasyPrivateTokenContract.at(contractAddress.address, ownerWallet);
      await waitForAccountSynch(context.pxe, ownerAddress, { interval: 1, timeout: 10 });
      await expect(contract.methods.getBalance(ownerAddress.address).view()).resolves.toEqual(2000n);
    });
  });
});
