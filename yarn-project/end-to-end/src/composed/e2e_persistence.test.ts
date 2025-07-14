import { getSchnorrAccount, getSchnorrWallet } from '@aztec/accounts/schnorr';
import { type InitialAccountData, deployFundedSchnorrAccount } from '@aztec/accounts/testing';
import {
  type AccountWallet,
  type ContractInstanceWithAddress,
  type PXE,
  type TxHash,
  computeSecretHash,
} from '@aztec/aztec.js';
import type { DeployL1ContractsReturnType } from '@aztec/ethereum';
import { Fr } from '@aztec/foundation/fields';
// We use TokenBlacklist because we want to test the persistence of manually added notes and standard token no longer
// implements TransparentNote shield flow.
import { TokenBlacklistContract } from '@aztec/noir-contracts.js/TokenBlacklist';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import { jest } from '@jest/globals';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { BlacklistTokenContractTest, Role } from '../e2e_blacklist_token_contract/blacklist_token_contract_test.js';
import { type EndToEndContext, setup } from '../fixtures/utils.js';

jest.setTimeout(60_000);

describe('Aztec persistence', () => {
  /**
   * These tests check that the Aztec Node and PXE can be shutdown and restarted without losing data.
   *
   * There are five scenarios to check:
   * 1. Node and PXE are started with an existing databases
   * 2. PXE is started with an existing database and connects to a Node with an empty database
   * 3. PXE is started with an empty database and connects to a Node with an existing database
   * 4. PXE is started with an empty database and connects to a Node with an empty database
   * 5. Node and PXE are started with existing databases, but the chain has advanced since they were shutdown
   *
   * All five scenarios use the same L1 state, which is deployed in the `beforeAll` hook.
   */

  let pxe: PXE;

  // the test contract and account deploying it
  let contractInstance: ContractInstanceWithAddress;
  let contractAddress: AztecAddress;
  let owner: InitialAccountData;

  // Data of the funded accounts that can deploy themselves.
  let initialFundedAccounts: InitialAccountData[];

  // a directory where data will be persisted by components
  // passing this through to the Node or PXE will control whether they use persisted data or not
  let dataDirectory: string;

  // state that is persisted between tests
  let deployL1ContractsValues: DeployL1ContractsReturnType;

  let context: EndToEndContext;

  // deploy L1 contracts, start initial node & PXE, deploy test contract & shutdown node and PXE
  beforeAll(async () => {
    dataDirectory = await mkdtemp(join(tmpdir(), 'aztec-node-'));

    const initialContext = await setup(1, { dataDirectory, numberOfInitialFundedAccounts: 3 }, { dataDirectory });
    pxe = initialContext.pxe;
    deployL1ContractsValues = initialContext.deployL1ContractsValues;

    initialFundedAccounts = initialContext.initialFundedAccounts;
    owner = initialFundedAccounts[0];
    const ownerWallet = initialContext.wallet;

    const contract = await TokenBlacklistContract.deploy(ownerWallet, ownerWallet.getAddress()).send().deployed();
    contractInstance = contract.instance;
    contractAddress = contract.address;

    await progressBlocksPastDelay(contract);

    const adminMinterRole = new Role().withAdmin().withMinter();
    await contract.methods.update_roles(ownerWallet.getAddress(), adminMinterRole.toNoirStruct()).send().wait();

    await progressBlocksPastDelay(contract);

    const secret = Fr.random();

    const mintTxReceipt = await contract.methods
      .mint_private(1000n, await computeSecretHash(secret))
      .send()
      .wait();

    await addPendingShieldNoteToPXE(
      contract,
      ownerWallet.getAddress(),
      1000n,
      await computeSecretHash(secret),
      mintTxReceipt.txHash,
      pxe,
    );

    await contract.methods.redeem_shield(owner.address, 1000n, secret).send().wait();

    await progressBlocksPastDelay(contract);

    await initialContext.teardown();
  }, 180_000);

  const progressBlocksPastDelay = async (contract: TokenBlacklistContract) => {
    for (let i = 0; i < BlacklistTokenContractTest.CHANGE_ROLES_DELAY; ++i) {
      await contract.methods.get_roles(owner.address).send().wait();
    }
  };

  describe.each([
    [
      // ie we were shutdown and now starting back up. Initial sync should be ~instant
      'when starting Node and PXE with existing databases',
      () => setup(0, { dataDirectory, deployL1ContractsValues, initialFundedAccounts }, { dataDirectory }),
      1000,
    ],
    [
      // ie our PXE was restarted, data kept intact and now connects to a "new" Node. Initial synch will synch from scratch
      'when starting a PXE with an existing database, connected to a Node with database synched from scratch',
      () => setup(0, { deployL1ContractsValues, initialFundedAccounts }, { dataDirectory }),
      10_000,
    ],
  ])('%s', (_, contextSetup, timeout) => {
    let ownerWallet: AccountWallet;
    let contract: TokenBlacklistContract;

    beforeEach(async () => {
      context = await contextSetup();
      ownerWallet = await getSchnorrWallet(context.pxe, owner.address, owner.signingKey);
      contract = await TokenBlacklistContract.at(contractAddress, ownerWallet);
    }, timeout);

    afterEach(async () => {
      await context.teardown();
    });

    it('correctly restores private notes', async () => {
      // test for >0 instead of exact value so test isn't dependent on run order
      await expect(contract.methods.balance_of_private(ownerWallet.getAddress()).simulate()).resolves.toBeGreaterThan(
        0n,
      );
    });

    it('correctly restores public storage', async () => {
      await expect(contract.methods.total_supply().simulate()).resolves.toBeGreaterThan(0n);
    });

    it('tracks new notes for the owner', async () => {
      const balance = await contract.methods.balance_of_private(ownerWallet.getAddress()).simulate();

      const secret = Fr.random();
      const mintTxReceipt = await contract.methods
        .mint_private(1000n, await computeSecretHash(secret))
        .send()
        .wait();
      await addPendingShieldNoteToPXE(
        contract,
        ownerWallet.getAddress(),
        1000n,
        await computeSecretHash(secret),
        mintTxReceipt.txHash,
        pxe,
      );

      await contract.methods.redeem_shield(ownerWallet.getAddress(), 1000n, secret).send().wait();

      await expect(contract.methods.balance_of_private(ownerWallet.getAddress()).simulate()).resolves.toEqual(
        balance + 1000n,
      );
    });

    it('allows spending of private notes', async () => {
      const otherAccount = await deployFundedSchnorrAccount(context.pxe, initialFundedAccounts[1]);
      const otherWallet = await otherAccount.getWallet();

      const initialOwnerBalance = await contract.methods.balance_of_private(ownerWallet.getAddress()).simulate();

      await contract.methods.transfer(ownerWallet.getAddress(), otherWallet.getAddress(), 500n, 0).send().wait();

      const [ownerBalance, targetBalance] = await Promise.all([
        contract.methods.balance_of_private(ownerWallet.getAddress()).simulate(),
        contract.methods.balance_of_private(otherWallet.getAddress()).simulate(),
      ]);

      expect(ownerBalance).toEqual(initialOwnerBalance - 500n);
      expect(targetBalance).toEqual(500n);
    });
  });

  describe.each([
    [
      // ie. I'm setting up a new full node, sync from scratch and restore wallets/notes
      'when starting the Node and PXE with empty databases',
      () => setup(0, { deployL1ContractsValues, initialFundedAccounts }, {}),
      10_000,
    ],
    [
      // ie. I'm setting up a new PXE, restore wallets/notes from a Node
      'when starting a PXE with an empty database connected to a Node with an existing database',
      () => setup(0, { dataDirectory, deployL1ContractsValues, initialFundedAccounts }, {}),
      10_000,
    ],
  ])('%s', (_, contextSetup, timeout) => {
    beforeEach(async () => {
      context = await contextSetup();
    }, timeout);
    afterEach(async () => {
      await context.teardown();
    });

    it('the node has the contract', async () => {
      await expect(context.aztecNode.getContract(contractAddress)).resolves.toBeDefined();
    });

    it('pxe does not know of the deployed contract', async () => {
      const account = initialFundedAccounts[0];
      const wallet = await (
        await getSchnorrAccount(context.pxe, account.secret, account.signingKey, account.salt)
      ).register();
      await expect(TokenBlacklistContract.at(contractAddress, wallet)).rejects.toThrow(/has not been registered/);
    });

    it("pxe does not have owner's private notes", async () => {
      await context.pxe.registerContract({
        artifact: TokenBlacklistContract.artifact,
        instance: contractInstance,
      });

      const account = initialFundedAccounts[1]; // Not the owner account.
      const wallet = await (
        await getSchnorrAccount(context.pxe, account.secret, account.signingKey, account.salt)
      ).register();
      const contract = await TokenBlacklistContract.at(contractAddress, wallet);
      await expect(contract.methods.balance_of_private(owner.address).simulate()).resolves.toEqual(0n);
    });

    it('has access to public storage', async () => {
      await context.pxe.registerContract({
        artifact: TokenBlacklistContract.artifact,
        instance: contractInstance,
      });

      const account = initialFundedAccounts[1]; // Not the owner account.
      const wallet = await (
        await getSchnorrAccount(context.pxe, account.secret, account.signingKey, account.salt)
      ).register();
      const contract = await TokenBlacklistContract.at(contractAddress, wallet);

      await expect(contract.methods.total_supply().simulate()).resolves.toBeGreaterThan(0n);
    });

    it('pxe restores notes after registering the owner', async () => {
      await context.pxe.registerContract({
        artifact: TokenBlacklistContract.artifact,
        instance: contractInstance,
      });

      const ownerAccount = await getSchnorrAccount(context.pxe, owner.secret, owner.signingKey, owner.salt);
      await ownerAccount.register();
      const ownerWallet = await ownerAccount.getWallet();
      const contract = await TokenBlacklistContract.at(contractAddress, ownerWallet);

      // check that notes total more than 0 so that this test isn't dependent on run order
      await expect(contract.methods.balance_of_private(owner.address).simulate()).resolves.toBeGreaterThan(0n);
    });
  });

  describe('when starting Node and PXE with existing databases, but chain has advanced since they were shutdown', () => {
    let secret: Fr;
    let mintTxHash: TxHash;
    let mintAmount: bigint;
    let revealedAmount: bigint;

    // The test system is shutdown. Its state is saved to disk
    // Start a temporary node and PXE, synch it and add the contract and account to it.
    // Perform some actions with these temporary components to advance the chain
    // Then shutdown the temporary components and restart the original components
    // They should sync up from where they left off and be able to see the actions performed by the temporary node & PXE.
    beforeAll(async () => {
      const temporaryContext = await setup(0, { deployL1ContractsValues }, {});

      await temporaryContext.pxe.registerContract({
        artifact: TokenBlacklistContract.artifact,
        instance: contractInstance,
      });

      const ownerAccount = await getSchnorrAccount(temporaryContext.pxe, owner.secret, owner.signingKey, owner.salt);
      await ownerAccount.register();
      const ownerWallet = await ownerAccount.getWallet();

      const contract = await TokenBlacklistContract.at(contractAddress, ownerWallet);

      // mint some tokens with a secret we know and redeem later on a separate PXE
      secret = Fr.random();
      mintAmount = 1000n;
      const mintTxReceipt = await contract.methods
        .mint_private(mintAmount, await computeSecretHash(secret))
        .send()
        .wait();
      mintTxHash = mintTxReceipt.txHash;

      // publicly reveal that I have 1000 tokens
      revealedAmount = 1000n;
      await contract.methods.unshield(owner.address, owner.address, revealedAmount, 0).send().wait();

      // shut everything down
      await temporaryContext.teardown();
    });

    let ownerWallet: AccountWallet;
    let contract: TokenBlacklistContract;

    beforeEach(async () => {
      context = await setup(0, { dataDirectory, deployL1ContractsValues }, { dataDirectory });
      ownerWallet = await getSchnorrWallet(context.pxe, owner.address, owner.signingKey);
      contract = await TokenBlacklistContract.at(contractAddress, ownerWallet);
    });

    afterEach(async () => {
      await context.teardown();
    });

    it("restores owner's public balance", async () => {
      await expect(contract.methods.balance_of_public(owner.address).simulate()).resolves.toEqual(revealedAmount);
    });

    it('allows consuming transparent note created on another PXE', async () => {
      // this was created in the temporary PXE in `beforeAll`
      await addPendingShieldNoteToPXE(
        contract,
        ownerWallet.getAddress(),
        mintAmount,
        await computeSecretHash(secret),
        mintTxHash,
        pxe,
      );

      const balanceBeforeRedeem = await contract.methods.balance_of_private(ownerWallet.getAddress()).simulate();

      await contract.methods.redeem_shield(ownerWallet.getAddress(), mintAmount, secret).send().wait();
      const balanceAfterRedeem = await contract.methods.balance_of_private(ownerWallet.getAddress()).simulate();

      expect(balanceAfterRedeem).toEqual(balanceBeforeRedeem + mintAmount);
    });
  });
});

async function addPendingShieldNoteToPXE(
  contract: TokenBlacklistContract,
  recipient: AztecAddress,
  amount: bigint,
  secretHash: Fr,
  txHash: TxHash,
  pxe: PXE,
) {
  // docs:start:offchain_delivery
  const txEffects = await pxe.getTxEffect(txHash);
  await contract.methods
    .deliver_transparent_note(
      contract.address,
      amount,
      secretHash,
      txHash.hash,
      txEffects!.data.noteHashes,
      txEffects!.data.nullifiers[0],
      recipient,
    )
    .simulate();
  // docs:end:offchain_delivery
}
