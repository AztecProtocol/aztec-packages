import { getSchnorrAccount, getSchnorrWalletWithSecretKey } from '@aztec/accounts/schnorr';
import { generateSchnorrAccounts, getDeployedTestAccountsWallets } from '@aztec/accounts/testing';
import {
  AccountWalletWithSecretKey,
  AztecAddress,
  type AztecNode,
  FeeJuicePaymentMethodWithClaim,
  Fr,
  L1FeeJuicePortalManager,
  type PXE,
  retryUntil,
} from '@aztec/aztec.js';
import { RollupContract, createEthereumChain, createL1Clients, getL1ContractsConfigEnvVars } from '@aztec/ethereum';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { TokenContract } from '@aztec/noir-contracts.js/Token';

import { jest } from '@jest/globals';

import type { EndToEndContext } from '../fixtures/utils.js';
import { EpochsTestContext } from './epochs_test.js';
import type { TestWallets } from './setup_test_wallets.js';

const TOKEN_NAME = 'USDC';
const TOKEN_SYMBOL = 'USD';
const TOKEN_DECIMALS = 18n;

async function deployTokenAndMint(
  wallets: AccountWalletWithSecretKey[],
  admin: AztecAddress,
  mintAmount: bigint,
  logger: Logger,
) {
  logger.verbose(`Deploying TokenContract...`);
  const tokenContract = await TokenContract.deploy(wallets[0], admin, TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS)
    .send()
    .deployed({ timeout: 600 });

  const tokenAddress = tokenContract.address;

  logger.verbose(`Minting ${mintAmount} public assets to the ${wallets.length} wallets...`);

  await Promise.all(
    wallets.map(async w =>
      (await TokenContract.at(tokenAddress, w)).methods
        .mint_to_public(w.getAddress(), mintAmount)
        .send()
        .wait({ timeout: 600 }),
    ),
  );

  logger.verbose(`Minting complete.`);

  return tokenAddress;
}

async function bridgeL1FeeJuice(
  l1RpcUrl: string,
  mnemonicOrPrivateKey: string,
  pxe: PXE,
  recipient: AztecAddress,
  amount: bigint,
  log: Logger,
) {
  const nodeInfo = await pxe.getNodeInfo();
  const l1ChainId = nodeInfo.l1ChainId;
  const chain = createEthereumChain([l1RpcUrl], l1ChainId);
  const { publicClient, walletClient } = createL1Clients(chain.rpcUrls, mnemonicOrPrivateKey, chain.chainInfo);

  const portal = await L1FeeJuicePortalManager.new(pxe, publicClient, walletClient, log);
  const claim = await portal.bridgeTokensPublic(recipient, amount, true /* mint */);

  const isSynced = async () => await pxe.isL1ToL2MessageSynced(Fr.fromHexString(claim.messageHash));
  await retryUntil(isSynced, `message ${claim.messageHash} sync`, 24, 0.5);

  log.info(`Created a claim for ${amount} L1 fee juice to ${recipient}.`, claim);
  return claim;
}

async function advanceL2Block(node: AztecNode) {
  const initialBlockNumber = await node.getBlockNumber();
  await node!.flushTxs();
  await retryUntil(async () => (await node.getBlockNumber()) >= initialBlockNumber + 1);
}

async function deployTestWalletWithTokens(
  pxe: PXE,
  node: AztecNode,
  l1RpcUrl: string,
  mnemonicOrPrivateKey: string,
  mintAmount: bigint,
  logger: Logger,
  numberOfFundedWallets = 1,
  initialFeeJuice = 10n ** 22n,
): Promise<TestWallets> {
  const [recipient, ...funded] = await generateSchnorrAccounts(numberOfFundedWallets + 1);
  const recipientWallet = await getSchnorrWalletWithSecretKey(
    pxe,
    recipient.secret,
    recipient.signingKey,
    recipient.salt,
  );
  const fundedAccounts = await Promise.all(funded.map(a => getSchnorrAccount(pxe, a.secret, a.signingKey, a.salt)));

  const claims = await Promise.all(
    fundedAccounts.map(a =>
      bridgeL1FeeJuice(l1RpcUrl, mnemonicOrPrivateKey, pxe, a.getAddress(), initialFeeJuice, logger),
    ),
  );

  // Progress by 2 L2 blocks so that the l1ToL2Message added above will be available to use on L2.
  await advanceL2Block(node);
  await advanceL2Block(node);
  await advanceL2Block(node);

  const wallets = await Promise.all(
    fundedAccounts.map(async (a, i) => {
      const wallet = await a.getWallet();
      const paymentMethod = new FeeJuicePaymentMethodWithClaim(wallet, claims[i]);
      await a.deploy({ fee: { paymentMethod } }).wait();
      logger.info(`Account deployed at ${a.getAddress()}`);
      return wallet;
    }),
  );

  const tokenAdmin = wallets[0];
  const tokenAddress = await deployTokenAndMint(wallets, tokenAdmin.getAddress(), mintAmount, logger);
  const tokenAdminWallet = await TokenContract.at(tokenAddress, tokenAdmin);

  return { pxe, wallets, tokenAdminWallet, tokenName: TOKEN_NAME, tokenAddress, recipientWallet };
}

describe('token transfer test', () => {
  jest.setTimeout(10 * 60 * 4000); // 40 minutes

  let logger = createLogger(`e2e:epochs:4epochs`);
  const l1Config = getL1ContractsConfigEnvVars();

  // We want plenty of minted tokens for a lot of slots that fill up multiple epochs
  const MINT_AMOUNT = 2000000n;
  const TEST_EPOCHS = 4;
  const MAX_MISSED_SLOTS = 10n;
  const ROUNDS = BigInt(l1Config.aztecEpochDuration * TEST_EPOCHS);
  const L1_ACCOUNT_MNEMONIC = 'test test test test test test test test test test test junk';

  let testWallets: TestWallets;
  let rollup: RollupContract;
  let pxe: PXE;
  let node: AztecNode;
  let nodes: AztecNode[] = [];

  let test: EpochsTestContext;
  let context: EndToEndContext;

  beforeEach(async () => {
    const acvmWorkingDirectory = '/mnt/user-data/phil/tmp';
    test = await EpochsTestContext.setup({
      skipProtocolContracts: false,
      acvmWorkingDirectory: acvmWorkingDirectory,
      bbSkipCleanup: true,
      bbWorkingDirectory: acvmWorkingDirectory,
    });
    ({ rollup, logger, pxe, nodes, context } = test);
    node = nodes[0];

    testWallets = await deployTestWalletWithTokens(
      pxe,
      node,
      context.config.l1RpcUrls[0],
      L1_ACCOUNT_MNEMONIC,
      MINT_AMOUNT,
      logger,
    );
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  it('transfer tokens for 4 epochs', async () => {
    const l1ContractAddresses = await testWallets.pxe.getNodeInfo().then(n => n.l1ContractAddresses);
    // Get 4 epochs
    logger.info(`Deployed L1 contract addresses: ${JSON.stringify(l1ContractAddresses)}`);
    const recipient = testWallets.recipientWallet.getAddress();
    const transferAmount = 1n;

    for (const w of testWallets.wallets) {
      expect(MINT_AMOUNT).toBe(await testWallets.tokenAdminWallet.methods.balance_of_public(w.getAddress()).simulate());
    }

    logger.info('Minted tokens');

    expect(0n).toBe(await testWallets.tokenAdminWallet.methods.balance_of_public(recipient).simulate());

    console.log(`STARTING TRANSFERS!!!!!!!!`);

    // For each round, make both private and public transfers
    const startSlot = await rollup.getSlotNumber();
    for (let i = 1n; i <= ROUNDS; i++) {
      const interactions = await Promise.all([
        ...testWallets.wallets.map(async w =>
          (
            await TokenContract.at(testWallets.tokenAddress, w)
          ).methods.transfer_in_public(w.getAddress(), recipient, transferAmount, 0),
        ),
      ]);

      logger.info(`Created interactions ${interactions.length} for round ${i} of ${ROUNDS}`);

      const txs = await Promise.all(interactions.map(async i => await i.prove()));

      logger.info(`Proved ${txs.length} in round ${i} of ${ROUNDS}`);

      await Promise.all(txs.map(t => t.send().wait({ timeout: 600 })));
      const currentSlot = await rollup.getSlotNumber();
      expect(currentSlot).toBeLessThanOrEqual(startSlot + i + MAX_MISSED_SLOTS);
      const startEpoch = await rollup.getSlotNumber();
      logger.debug(
        `Successfully reached slot ${currentSlot} (iteration ${
          currentSlot - startSlot
        }/${ROUNDS}) (Epoch ${startEpoch})`,
      );
    }

    for (const w of testWallets.wallets) {
      expect(MINT_AMOUNT - ROUNDS * transferAmount).toBe(
        await testWallets.tokenAdminWallet.methods.balance_of_public(w.getAddress()).simulate(),
      );
    }

    expect(ROUNDS * transferAmount * BigInt(testWallets.wallets.length)).toBe(
      await testWallets.tokenAdminWallet.methods.balance_of_public(recipient).simulate(),
    );
  });
});
