import {
  AztecAddress,
  AztecNode,
  CompleteAddress,
  DebugLogger,
  EthAddress,
  ExtendedNote,
  Fr,
  GrumpkinScalar,
  Note,
  PXE,
  TxStatus,
  Wallet,
  computeMessageSecretHash,
  getUnsafeSchnorrAccount,
  retryUntil,
} from '@aztec/aztec.js';
import { ChildContract, TokenContract } from '@aztec/noir-contracts/types';

import { jest } from '@jest/globals';

import { expectsNumOfEncryptedLogsInTheLastBlockToBe, setup, setupPXEService } from './fixtures/utils.js';

const TIMEOUT = 60_000;

describe('e2e_2_pxes', () => {
  jest.setTimeout(TIMEOUT);

  let aztecNode: AztecNode | undefined;
  let pxeA: PXE;
  let pxeB: PXE;
  let walletA: Wallet;
  let walletB: Wallet;
  let userA: CompleteAddress;
  let userB: CompleteAddress;
  let logger: DebugLogger;
  let teardownA: () => Promise<void>;

  beforeEach(async () => {
    let accounts: CompleteAddress[] = [];
    ({
      aztecNode,
      pxe: pxeA,
      accounts,
      wallets: [walletA],
      logger,
      teardown: teardownA,
    } = await setup(1));
    [userA] = accounts;

    ({
      pxe: pxeB,
      accounts: accounts,
      wallets: [walletB],
    } = await setupPXEService(1, aztecNode!, undefined, true));
    [userB] = accounts;
  }, 100_000);

  afterEach(async () => {
    await teardownA();
    if ((pxeB as any).stop) {
      await (pxeB as any).stop();
    }
  });

  const awaitUserSynchronized = async (wallet: Wallet, owner: AztecAddress) => {
    const isUserSynchronized = async () => {
      return await wallet.isAccountStateSynchronized(owner);
    };
    await retryUntil(isUserSynchronized, `synch of user ${owner.toString()}`, 10);
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
    const balance = await contractWithWallet.methods.balance_of_private(owner).view({ from: owner });
    logger(`Account ${owner} balance: ${balance}`);
    expect(balance).toBe(expectedBalance);
  };

  const deployTokenContract = async (initialAdminBalance: bigint, admin: AztecAddress, pxe: PXE) => {
    logger(`Deploying Token contract...`);
    const contract = await TokenContract.deploy(walletA, admin).send().deployed();

    if (initialAdminBalance > 0n) {
      await mintTokens(contract, admin, initialAdminBalance, pxe);
    }

    logger('L2 contract deployed');

    return contract.completeAddress;
  };

  const mintTokens = async (contract: TokenContract, recipient: AztecAddress, balance: bigint, pxe: PXE) => {
    const secret = Fr.random();
    const secretHash = computeMessageSecretHash(secret);

    const receipt = await contract.methods.mint_private(balance, secretHash).send().wait();
    expect(receipt.status).toEqual(TxStatus.MINED);

    const storageSlot = new Fr(5);
    const note = new Note([new Fr(balance), secretHash]);
    const extendedNote = new ExtendedNote(note, recipient, contract.address, storageSlot, receipt.txHash);
    await pxe.addNote(extendedNote);

    expect((await contract.methods.redeem_shield(recipient, balance, secret).send().wait()).status).toEqual(
      TxStatus.MINED,
    );
  };

  it('transfers funds from user A to B via PXE A followed by transfer from B to A via PXE B', async () => {
    const initialBalance = 987n;
    const transferAmount1 = 654n;
    const transferAmount2 = 323n;

    const completeTokenAddress = await deployTokenContract(initialBalance, userA.address, pxeA);
    const tokenAddress = completeTokenAddress.address;

    // Add account B to wallet A
    await pxeA.registerRecipient(userB);
    // Add account A to wallet B
    await pxeB.registerRecipient(userA);

    // Add token to PXE B (PXE A already has it because it was deployed through it)
    await pxeB.addContracts([
      {
        artifact: TokenContract.artifact,
        completeAddress: completeTokenAddress,
        portalContract: EthAddress.ZERO,
      },
    ]);

    // Check initial balances and logs are as expected
    await expectTokenBalance(walletA, tokenAddress, userA.address, initialBalance);
    await expectTokenBalance(walletB, tokenAddress, userB.address, 0n);
    await expectsNumOfEncryptedLogsInTheLastBlockToBe(aztecNode, 1);

    // Transfer funds from A to B via PXE A
    const contractWithWalletA = await TokenContract.at(tokenAddress, walletA);
    const receiptAToB = await contractWithWalletA.methods
      .transfer(userA.address, userB.address, transferAmount1, 0)
      .send()
      .wait();
    expect(receiptAToB.status).toBe(TxStatus.MINED);

    // Check balances and logs are as expected
    await expectTokenBalance(walletA, tokenAddress, userA.address, initialBalance - transferAmount1);
    await expectTokenBalance(walletB, tokenAddress, userB.address, transferAmount1);
    await expectsNumOfEncryptedLogsInTheLastBlockToBe(aztecNode, 2);

    // Transfer funds from B to A via PXE B
    const contractWithWalletB = await TokenContract.at(tokenAddress, walletB);
    await contractWithWalletB.methods
      .transfer(userB.address, userA.address, transferAmount2, 0)
      .send()
      .wait({ interval: 0.1 });

    // Check balances and logs are as expected
    await expectTokenBalance(walletA, tokenAddress, userA.address, initialBalance - transferAmount1 + transferAmount2);
    await expectTokenBalance(walletB, tokenAddress, userB.address, transferAmount1 - transferAmount2);
    await expectsNumOfEncryptedLogsInTheLastBlockToBe(aztecNode, 2);
  }, 120_000);

  const deployChildContractViaServerA = async () => {
    logger(`Deploying Child contract...`);
    const contract = await ChildContract.deploy(walletA).send().deployed();
    logger('Child contract deployed');

    return contract.completeAddress;
  };

  const awaitServerSynchronized = async (server: PXE) => {
    const isServerSynchronized = async () => {
      return await server.isGlobalStateSynchronized();
    };
    await retryUntil(isServerSynchronized, 'server sync', 10);
  };

  const getChildStoredValue = (child: { address: AztecAddress }, pxe: PXE) =>
    pxe.getPublicStorageAt(child.address, new Fr(1));

  it('user calls a public function on a contract deployed by a different user using a different PXE', async () => {
    const childCompleteAddress = await deployChildContractViaServerA();

    await awaitServerSynchronized(pxeA);

    // Add Child to PXE B
    await pxeB.addContracts([
      {
        artifact: ChildContract.artifact,
        completeAddress: childCompleteAddress,
        portalContract: EthAddress.ZERO,
      },
    ]);

    const newValueToSet = new Fr(256n);

    const childContractWithWalletB = await ChildContract.at(childCompleteAddress.address, walletB);
    await childContractWithWalletB.methods.pubIncValue(newValueToSet).send().wait({ interval: 0.1 });

    await awaitServerSynchronized(pxeA);

    const storedValue = await getChildStoredValue(childCompleteAddress, pxeB);
    expect(storedValue).toEqual(newValueToSet);
  });

  it('private state is "zero" when Private eXecution Environment (PXE) does not have the account private key', async () => {
    const userABalance = 100n;
    const userBBalance = 150n;

    const completeTokenAddress = await deployTokenContract(userABalance, userA.address, pxeA);
    const contractWithWalletA = await TokenContract.at(completeTokenAddress.address, walletA);

    // Add account B to wallet A
    await pxeA.registerRecipient(userB);
    // Add account A to wallet B
    await pxeB.registerRecipient(userA);

    // Add token to PXE B (PXE A already has it because it was deployed through it)
    await pxeB.addContracts([
      {
        artifact: TokenContract.artifact,
        completeAddress: completeTokenAddress,
        portalContract: EthAddress.ZERO,
      },
    ]);

    // Mint tokens to user B
    await mintTokens(contractWithWalletA, userB.address, userBBalance, pxeA);

    // Check that user A balance is 100 on server A
    await expectTokenBalance(walletA, completeTokenAddress.address, userA.address, userABalance);
    // Check that user B balance is 150 on server B
    await expectTokenBalance(walletB, completeTokenAddress.address, userB.address, userBBalance);

    // CHECK THAT PRIVATE BALANCES ARE 0 WHEN ACCOUNT'S PRIVATE KEYS ARE NOT REGISTERED
    // Note: Not checking if the account is synchronized because it is not registered as an account (it would throw).
    const checkIfSynchronized = false;
    // Check that user A balance is 0 on server B
    await expectTokenBalance(walletB, completeTokenAddress.address, userA.address, 0n, checkIfSynchronized);
    // Check that user B balance is 0 on server A
    await expectTokenBalance(walletA, completeTokenAddress.address, userB.address, 0n, checkIfSynchronized);
  });

  it('permits migrating an account from one PXE to another', async () => {
    const privateKey = GrumpkinScalar.random();
    const account = getUnsafeSchnorrAccount(pxeA, privateKey, Fr.random());
    const completeAddress = account.getCompleteAddress();
    const wallet = await account.waitDeploy();

    await expect(wallet.isAccountStateSynchronized(completeAddress.address)).resolves.toBe(true);
    const accountOnB = getUnsafeSchnorrAccount(pxeB, privateKey, completeAddress);
    const walletOnB = await accountOnB.getWallet();

    // need to register first otherwise the new PXE won't know about the account
    await expect(walletOnB.isAccountStateSynchronized(completeAddress.address)).rejects.toThrow();

    await accountOnB.register();
    // registering should wait for the account to be synchronized
    await expect(walletOnB.isAccountStateSynchronized(completeAddress.address)).resolves.toBe(true);
  });
});
