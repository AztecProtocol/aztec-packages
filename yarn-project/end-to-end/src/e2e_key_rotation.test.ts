import { createAccounts } from '@aztec/accounts/testing';
import {
  type AztecAddress,
  type AztecNode,
  type DebugLogger,
  ExtendedNote,
  Fq,
  Fr,
  Note,
  type PXE,
  type Wallet,
  computeSecretHash,
  retryUntil,
} from '@aztec/aztec.js';
import { derivePublicKeyFromSecretKey } from '@aztec/circuits.js';
import { KeyRegistryContract, TestContract, TokenContract } from '@aztec/noir-contracts.js';
import { getCanonicalKeyRegistryAddress } from '@aztec/protocol-contracts/key-registry';

import { jest } from '@jest/globals';

import { expectsNumOfEncryptedLogsInTheLastBlockToBe, setup, setupPXEService } from './fixtures/utils.js';

const TIMEOUT = 120_000;

describe('e2e_key_rotation', () => {
  jest.setTimeout(TIMEOUT);

  let aztecNode: AztecNode | undefined;
  let pxeA: PXE;
  let pxeB: PXE;
  let walletA: Wallet;
  let walletB: Wallet;
  let logger: DebugLogger;
  let teardownA: () => Promise<void>;
  let teardownB: () => Promise<void>;

  let keyRegistryWithB: KeyRegistryContract;

  let testContract: TestContract;

  const SHARED_MUTABLE_DELAY = 5 + 3;

  beforeEach(async () => {
    ({
      aztecNode,
      pxe: pxeA,
      wallets: [walletA],
      logger,
      teardown: teardownA,
    } = await setup(1));

    ({ pxe: pxeB, teardown: teardownB } = await setupPXEService(aztecNode!, {}, undefined, true));

    [walletB] = await createAccounts(pxeB, 1);
    keyRegistryWithB = await KeyRegistryContract.at(getCanonicalKeyRegistryAddress(), walletB);

    testContract = await TestContract.deploy(walletA).send().deployed();
  });

  afterEach(async () => {
    await teardownB();
    await teardownA();
  });

  const awaitUserSynchronized = async (wallet: Wallet, owner: AztecAddress) => {
    const isUserSynchronized = async () => {
      return await wallet.isAccountStateSynchronized(owner);
    };
    await retryUntil(isUserSynchronized, `synch of user ${owner.toString()}`, 10);
  };

  const crossDelay = async () => {
    for (let i = 0; i < SHARED_MUTABLE_DELAY; i++) {
      // We send arbitrary tx to mine a block
      await testContract.methods.emit_unencrypted(0).send().wait();
    }
  };

  const expectTokenBalance = async (
    wallet: Wallet,
    tokenAddress: AztecAddress,
    owner: AztecAddress,
    expectedBalance: bigint,
    checkIfSynchronized = true,
  ) => {
    if (checkIfSynchronized) {
      // First wait until the corresponding PXE has synchronized the account
      await awaitUserSynchronized(wallet, owner);
    }

    // Then check the balance
    const contractWithWallet = await TokenContract.at(tokenAddress, wallet);
    const balance = await contractWithWallet.methods.balance_of_private(owner).simulate({ from: owner });
    logger.info(`Account ${owner} balance: ${balance}`);
    expect(balance).toBe(expectedBalance);
  };

  const deployTokenContract = async (initialAdminBalance: bigint, admin: AztecAddress, pxe: PXE) => {
    logger.info(`Deploying Token contract...`);
    const contract = await TokenContract.deploy(walletA, admin, 'TokenName', 'TokenSymbol', 18).send().deployed();

    if (initialAdminBalance > 0n) {
      await mintTokens(contract, admin, initialAdminBalance, pxe);
    }

    logger.info('L2 contract deployed');

    return contract.instance;
  };

  const mintTokens = async (contract: TokenContract, recipient: AztecAddress, balance: bigint, pxe: PXE) => {
    const secret = Fr.random();
    const secretHash = computeSecretHash(secret);

    const receipt = await contract.methods.mint_private(balance, secretHash).send().wait();

    const note = new Note([new Fr(balance), secretHash]);
    const extendedNote = new ExtendedNote(
      note,
      recipient,
      contract.address,
      TokenContract.storage.pending_shields.slot,
      TokenContract.notes.TransparentNote.id,
      receipt.txHash,
    );
    await pxe.addNote(extendedNote);

    await contract.methods.redeem_shield(recipient, balance, secret).send().wait();
  };

  it('rotates key', async () => {
    const initialBalance = 987n;
    const transferAmount1 = 654n;
    // const transferAmount2 = 323n;

    const tokenInstance = await deployTokenContract(initialBalance, walletA.getAddress(), pxeA);
    const tokenAddress = tokenInstance.address;

    // Add account B to wallet A
    await pxeA.registerRecipient(walletB.getCompleteAddress());
    // Add account A to wallet B
    await pxeB.registerRecipient(walletA.getCompleteAddress());

    // Add token to PXE B (PXE A already has it because it was deployed through it)
    await pxeB.registerContract({
      artifact: TokenContract.artifact,
      instance: tokenInstance,
    });

    // Check initial balances and logs are as expected
    await expectTokenBalance(walletA, tokenAddress, walletA.getAddress(), initialBalance);
    await expectTokenBalance(walletB, tokenAddress, walletB.getAddress(), 0n);
    await expectsNumOfEncryptedLogsInTheLastBlockToBe(aztecNode, 1);

    // Transfer funds from A to B via PXE A
    const contractWithWalletA = await TokenContract.at(tokenAddress, walletA);
    await contractWithWalletA.methods
      .transfer(walletA.getAddress(), walletB.getAddress(), transferAmount1, 0)
      .send()
      .wait();

    // Check balances and logs are as expected
    await expectTokenBalance(walletA, tokenAddress, walletA.getAddress(), initialBalance - transferAmount1);
    await expectTokenBalance(walletB, tokenAddress, walletB.getAddress(), transferAmount1);
    await expectsNumOfEncryptedLogsInTheLastBlockToBe(aztecNode, 2);

    // Rotates B key
    const newNskM = Fq.random();
    const newNpkM = derivePublicKeyFromSecretKey(newNskM);
    await pxeB.rotateMasterNullifierKey(walletB.getAddress(), newNskM);

    await keyRegistryWithB.methods.rotate_npk_m(walletB.getAddress(), newNpkM, 0).send().wait();
    await crossDelay();

    // Transfer funds from A to B via PXE A
    await contractWithWalletA.methods.transfer(walletA.getAddress(), walletB.getAddress(), 123, 0).send().wait();

    await expectTokenBalance(walletA, tokenAddress, walletA.getAddress(), initialBalance - transferAmount1 - 123n);
    await expectTokenBalance(walletB, tokenAddress, walletB.getAddress(), transferAmount1 + 123n);
    // await expectsNumOfEncryptedLogsInTheLastBlockToBe(aztecNode, 2);

    // Transfer funds from B to A via PXE B
    const contractWithWalletB = await TokenContract.at(tokenAddress, walletB);
    await contractWithWalletB.methods
      .transfer(walletB.getAddress(), walletA.getAddress(), transferAmount1 + 123n, 0)
      .send()
      .wait({ interval: 0.1 });

    await expectTokenBalance(walletA, tokenAddress, walletA.getAddress(), initialBalance);
    await expectTokenBalance(walletB, tokenAddress, walletB.getAddress(), 0n);
  }, 600_000);
});
