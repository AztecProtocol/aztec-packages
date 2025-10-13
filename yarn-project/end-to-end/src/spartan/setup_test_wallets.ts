import { generateSchnorrAccounts } from '@aztec/accounts/testing';
import {
  AztecAddress,
  type AztecNode,
  FeeJuicePaymentMethodWithClaim,
  type FeePaymentMethod,
  Fr,
  L1FeeJuicePortalManager,
  SponsoredFeePaymentMethod,
  type Wallet,
  createAztecNodeClient,
  retryUntil,
} from '@aztec/aztec.js';
import { createEthereumChain, createExtendedL1Client } from '@aztec/ethereum';
import type { Logger } from '@aztec/foundation/log';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
import { registerInitialSandboxAccountsInWallet } from '@aztec/test-wallet/server';
import { TestWallet } from '@aztec/test-wallet/server';

import { getACVMConfig } from '../fixtures/get_acvm_config.js';
import { getBBConfig } from '../fixtures/get_bb_config.js';
import { getSponsoredFPCAddress, registerSponsoredFPC } from '../fixtures/utils.js';

export interface TestAccounts {
  aztecNode: AztecNode;
  wallet: TestWallet;
  accounts: AztecAddress[];
  tokenContract: TokenContract;
  tokenAdminAddress: AztecAddress;
  tokenName: string;
  recipientAddress: AztecAddress;
  tokenAddress: AztecAddress;
}

const TOKEN_NAME = 'USDC';
const TOKEN_SYMBOL = 'USD';
const TOKEN_DECIMALS = 18n;

export async function setupTestAccountsWithTokens(
  nodeUrl: string,
  mintAmount: bigint,
  logger: Logger,
): Promise<TestAccounts> {
  const ACCOUNT_COUNT = 1; // TODO fix this to allow for 16 wallets again

  const aztecNode = createAztecNodeClient(nodeUrl);
  const wallet = await TestWallet.create(aztecNode);

  const [recipientAccount, ...accounts] = (await registerInitialSandboxAccountsInWallet(wallet)).slice(
    0,
    ACCOUNT_COUNT + 1,
  );

  const tokenAdmin = accounts[0];
  const tokenAddress = await deployTokenAndMint(wallet, accounts, tokenAdmin, mintAmount, undefined, logger);
  const tokenContract = await TokenContract.at(tokenAddress, wallet);

  return {
    aztecNode,
    accounts,
    wallet,
    tokenAdminAddress: tokenAdmin,
    tokenName: TOKEN_NAME,
    tokenAddress,
    tokenContract,
    recipientAddress: recipientAccount,
  };
}

export async function deploySponsoredTestAccounts(
  wallet: TestWallet,
  aztecNode: AztecNode,
  mintAmount: bigint,
  logger: Logger,
  numberOfFundedWallets = 1,
): Promise<TestAccounts> {
  const [recipient, ...funded] = await generateSchnorrAccounts(numberOfFundedWallets + 1);
  const recipientAccount = await wallet.createSchnorrAccount(recipient.secret, recipient.salt);
  const fundedAccounts = await Promise.all(funded.map(a => wallet.createSchnorrAccount(a.secret, a.salt)));

  await registerSponsoredFPC(wallet);

  const paymentMethod = new SponsoredFeePaymentMethod(await getSponsoredFPCAddress());
  const recipientDeployMethod = await recipientAccount.getDeployMethod();
  await recipientDeployMethod.send({ from: AztecAddress.ZERO, fee: { paymentMethod } }).wait({ timeout: 2400 });
  await Promise.all(
    fundedAccounts.map(async a => {
      const deployMethod = await a.getDeployMethod();
      await deployMethod.send({ from: AztecAddress.ZERO, fee: { paymentMethod } }).wait({ timeout: 2400 }); // increase timeout on purpose in order to account for two empty epochs
      logger.info(`Account deployed at ${a.address}`);
    }),
  );

  const tokenAdmin = fundedAccounts[0];
  const tokenAddress = await deployTokenAndMint(
    wallet,
    fundedAccounts.map(acc => acc.address),
    tokenAdmin.address,
    mintAmount,
    new SponsoredFeePaymentMethod(await getSponsoredFPCAddress()),
    logger,
  );
  const tokenContract = await TokenContract.at(tokenAddress, wallet);

  return {
    aztecNode,
    wallet,
    accounts: fundedAccounts.map(acc => acc.address),
    tokenAdminAddress: tokenAdmin.address,
    tokenName: TOKEN_NAME,
    tokenAddress,
    tokenContract,
    recipientAddress: recipientAccount.address,
  };
}

export async function deployTestAccountsWithTokens(
  nodeUrl: string,
  l1RpcUrls: string[],
  mnemonicOrPrivateKey: string,
  mintAmount: bigint,
  logger: Logger,
  numberOfFundedWallets = 1,
): Promise<TestAccounts> {
  const aztecNode = createAztecNodeClient(nodeUrl);
  const wallet = await TestWallet.create(aztecNode);

  const [recipient, ...funded] = await generateSchnorrAccounts(numberOfFundedWallets + 1);
  const recipientAccount = await wallet.createSchnorrAccount(recipient.secret, recipient.salt);
  const fundedAccounts = await Promise.all(funded.map(a => wallet.createSchnorrAccount(a.secret, a.salt)));

  const claims = await Promise.all(
    fundedAccounts.map(a => bridgeL1FeeJuice(l1RpcUrls, mnemonicOrPrivateKey, aztecNode, a.address, undefined, logger)),
  );

  // Progress by 3 L2 blocks so that the l1ToL2Message added above will be available to use on L2.
  await advanceL2Block(aztecNode);
  await advanceL2Block(aztecNode);
  await advanceL2Block(aztecNode);

  await Promise.all(
    fundedAccounts.map(async (a, i) => {
      const paymentMethod = new FeeJuicePaymentMethodWithClaim(a.address, claims[i]);
      const deployMethod = await a.getDeployMethod();
      await deployMethod.send({ from: AztecAddress.ZERO, fee: { paymentMethod } }).wait();
      logger.info(`Account deployed at ${a.address}`);
    }),
  );

  const tokenAdmin = fundedAccounts[0];
  const tokenAddress = await deployTokenAndMint(
    wallet,
    fundedAccounts.map(acc => acc.address),
    tokenAdmin.address,
    mintAmount,
    undefined,
    logger,
  );
  const tokenContract = await TokenContract.at(tokenAddress, wallet);

  return {
    aztecNode,
    wallet,
    accounts: fundedAccounts.map(acc => acc.address),
    tokenAdminAddress: tokenAdmin.address,
    tokenName: TOKEN_NAME,
    tokenAddress,
    tokenContract,
    recipientAddress: recipientAccount.address,
  };
}

async function bridgeL1FeeJuice(
  l1RpcUrls: string[],
  mnemonicOrPrivateKey: string,
  aztecNode: AztecNode,
  recipient: AztecAddress,
  amount: bigint | undefined,
  log: Logger,
) {
  const { l1ChainId } = await aztecNode.getNodeInfo();
  const chain = createEthereumChain(l1RpcUrls, l1ChainId);
  const l1Client = createExtendedL1Client(chain.rpcUrls, mnemonicOrPrivateKey, chain.chainInfo);

  const portal = await L1FeeJuicePortalManager.new(aztecNode, l1Client, log);
  const claim = await portal.bridgeTokensPublic(recipient, amount, true /* mint */);

  const isSynced = async () =>
    (await aztecNode.getL1ToL2MessageBlock(Fr.fromHexString(claim.messageHash))) !== undefined;
  await retryUntil(isSynced, `message ${claim.messageHash} sync`, 24, 0.5);

  log.info(`Created a claim for ${amount} L1 fee juice to ${recipient}.`, claim);
  return claim;
}

async function advanceL2Block(aztecNode: AztecNode, nodeAdmin?: AztecNodeAdmin) {
  const initialBlockNumber = await aztecNode.getBlockNumber();

  let minTxsPerBlock = undefined;
  if (nodeAdmin) {
    ({ minTxsPerBlock } = await nodeAdmin.getConfig());
    await nodeAdmin.setConfig({ minTxsPerBlock: 0 }); // Set to 0 to ensure we can advance the block
  }

  await retryUntil(async () => (await aztecNode.getBlockNumber()) >= initialBlockNumber + 1);

  if (nodeAdmin && minTxsPerBlock !== undefined) {
    await nodeAdmin.setConfig({ minTxsPerBlock });
  }
}

async function deployTokenAndMint(
  wallet: Wallet,
  accounts: AztecAddress[],
  admin: AztecAddress,
  mintAmount: bigint,
  paymentMethod: FeePaymentMethod | undefined,
  logger: Logger,
) {
  logger.verbose(`Deploying TokenContract...`);
  const tokenContract = await TokenContract.deploy(wallet, admin, TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS)
    .send({
      from: admin,
      fee: {
        paymentMethod,
      },
    })
    .deployed({ timeout: 600 });

  const tokenAddress = tokenContract.address;

  logger.verbose(`Minting ${mintAmount} public assets to the ${accounts.length} accounts...`);

  await Promise.all(
    accounts.map(async acc =>
      (await TokenContract.at(tokenAddress, wallet)).methods
        .mint_to_public(acc, mintAmount)
        .send({ from: admin, fee: { paymentMethod } })
        .wait({ timeout: 600 }),
    ),
  );

  logger.verbose(`Minting complete.`);

  return tokenAddress;
}

export async function performTransfers({
  testAccounts,
  rounds,
  transferAmount,
  logger,
  feePaymentMethod,
}: {
  testAccounts: TestAccounts;
  rounds: number;
  transferAmount: bigint;
  logger: Logger;
  feePaymentMethod?: FeePaymentMethod;
}) {
  const recipient = testAccounts.recipientAddress;
  // Default to sponsored fee payment if no fee method is provided
  const defaultFeePaymentMethod = feePaymentMethod || new SponsoredFeePaymentMethod(await getSponsoredFPCAddress());
  for (let i = 0; i < rounds; i++) {
    const txs = testAccounts.accounts.map(async acc =>
      (await TokenContract.at(testAccounts.tokenAddress, testAccounts.wallet)).methods
        .transfer_in_public(acc, recipient, transferAmount, 0)
        .prove({ from: acc, fee: { paymentMethod: defaultFeePaymentMethod } }),
    );

    const provenTxs = await Promise.all(txs);

    await Promise.all(provenTxs.map(t => t.send().wait({ timeout: 600 })));

    logger.info(`Completed round ${i + 1} / ${rounds}`);
  }
}

export async function createWalletAndAztecNodeClient(
  nodeUrl: string,
  proverEnabled: boolean,
  logger: Logger,
): Promise<{ wallet: TestWallet; aztecNode: AztecNode; cleanup: () => Promise<void> }> {
  const aztecNode = createAztecNodeClient(nodeUrl);
  const [bbConfig, acvmConfig] = await Promise.all([getBBConfig(logger), getACVMConfig(logger)]);
  const pxeConfig = {
    dataDirectory: undefined,
    dataStoreMapSizeKB: 1024 * 1024,
    ...bbConfig,
    ...acvmConfig,
    proverEnabled,
  };
  const wallet = await TestWallet.create(aztecNode, pxeConfig);

  return {
    wallet,
    aztecNode,
    async cleanup() {
      await wallet.stop();
      await bbConfig?.cleanup();
      await acvmConfig?.cleanup();
    },
  };
}
