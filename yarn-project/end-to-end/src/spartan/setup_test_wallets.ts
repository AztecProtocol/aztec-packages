import { generateSchnorrAccounts, getDeployedTestAccounts } from '@aztec/accounts/testing';
import {
  type AztecAddress,
  type AztecNode,
  FeeJuicePaymentMethodWithClaim,
  type FeePaymentMethod,
  Fr,
  L1FeeJuicePortalManager,
  type PXE,
  SponsoredFeePaymentMethod,
  type Wallet,
  createAztecNodeClient,
  createCompatibleClient,
  retryUntil,
} from '@aztec/aztec.js';
import { createEthereumChain, createExtendedL1Client } from '@aztec/ethereum';
import type { Logger } from '@aztec/foundation/log';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { createPXEService } from '@aztec/pxe/server';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
import { TestWallet } from '@aztec/test-wallet';

import { getACVMConfig } from '../fixtures/get_acvm_config.js';
import { getBBConfig } from '../fixtures/get_bb_config.js';
import { getSponsoredFPCAddress, registerSponsoredFPC } from '../fixtures/utils.js';

export interface TestAccounts {
  pxe: PXE;
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
  pxeUrl: string,
  mintAmount: bigint,
  logger: Logger,
): Promise<TestAccounts> {
  const ACCOUNT_COUNT = 1; // TODO fix this to allow for 16 wallets again

  const pxe = await createCompatibleClient(pxeUrl, logger);
  const wallet = new TestWallet(pxe);

  const [recipientAccount, ...accounts] = (await getDeployedTestAccounts(pxe)).slice(0, ACCOUNT_COUNT + 1);

  const tokenAdmin = accounts[0];
  const tokenAddress = await deployTokenAndMint(
    wallet,
    accounts.map(acc => acc.address),
    tokenAdmin.address,
    mintAmount,
    undefined,
    logger,
  );
  const tokenContract = await TokenContract.at(tokenAddress, wallet);

  return {
    pxe,
    accounts: accounts.map(acc => acc.address),
    wallet,
    tokenAdminAddress: tokenAdmin.address,
    tokenName: TOKEN_NAME,
    tokenAddress,
    tokenContract,
    recipientAddress: recipientAccount.address,
  };
}

export async function deploySponsoredTestAccounts(
  pxe: PXE,
  mintAmount: bigint,
  logger: Logger,
  numberOfFundedWallets = 1,
): Promise<TestAccounts> {
  const wallet = new TestWallet(pxe);
  const [recipient, ...funded] = await generateSchnorrAccounts(numberOfFundedWallets + 1);
  const recipientAccount = await wallet.createSchnorrAccount(recipient.secret, recipient.salt);
  const fundedAccounts = await Promise.all(funded.map(a => wallet.createSchnorrAccount(a.secret, a.salt)));

  await registerSponsoredFPC(wallet);

  await Promise.all(
    fundedAccounts.map(async a => {
      const paymentMethod = new SponsoredFeePaymentMethod(await getSponsoredFPCAddress());
      await recipientAccount.deploy({ fee: { paymentMethod } }).wait({ timeout: 2400 }); // increase timeout on purpose in order to account for two empty epochs
      logger.info(`Account deployed at ${a.getAddress()}`);
    }),
  );

  const tokenAdmin = fundedAccounts[0];
  const tokenAddress = await deployTokenAndMint(
    wallet,
    fundedAccounts.map(acc => acc.getAddress()),
    tokenAdmin.getAddress(),
    mintAmount,
    new SponsoredFeePaymentMethod(await getSponsoredFPCAddress()),
    logger,
  );
  const tokenContract = await TokenContract.at(tokenAddress, wallet);

  return {
    pxe,
    wallet,
    accounts: fundedAccounts.map(acc => acc.getAddress()),
    tokenAdminAddress: tokenAdmin.getAddress(),
    tokenName: TOKEN_NAME,
    tokenAddress,
    tokenContract,
    recipientAddress: recipientAccount.getAddress(),
  };
}

export async function deployTestAccountsWithTokens(
  pxeUrl: string,
  nodeUrl: string,
  l1RpcUrls: string[],
  mnemonicOrPrivateKey: string,
  mintAmount: bigint,
  logger: Logger,
  numberOfFundedWallets = 1,
): Promise<TestAccounts> {
  const pxe = await createCompatibleClient(pxeUrl, logger);
  const node = createAztecNodeClient(nodeUrl);
  const wallet = new TestWallet(pxe);

  const [recipient, ...funded] = await generateSchnorrAccounts(numberOfFundedWallets + 1);
  const recipientAccount = await wallet.createSchnorrAccount(recipient.secret, recipient.salt);
  const fundedAccounts = await Promise.all(funded.map(a => wallet.createSchnorrAccount(a.secret, a.salt)));

  const claims = await Promise.all(
    fundedAccounts.map(a =>
      bridgeL1FeeJuice(l1RpcUrls, mnemonicOrPrivateKey, pxe, node, a.getAddress(), undefined, logger),
    ),
  );

  // Progress by 3 L2 blocks so that the l1ToL2Message added above will be available to use on L2.
  await advanceL2Block(node);
  await advanceL2Block(node);
  await advanceL2Block(node);

  await Promise.all(
    fundedAccounts.map(async (a, i) => {
      const paymentMethod = new FeeJuicePaymentMethodWithClaim(a.getAddress(), claims[i]);
      await a.deploy({ fee: { paymentMethod } }).wait();
      logger.info(`Account deployed at ${a.getAddress()}`);
    }),
  );

  const tokenAdmin = fundedAccounts[0];
  const tokenAddress = await deployTokenAndMint(
    wallet,
    fundedAccounts.map(acc => acc.getAddress()),
    tokenAdmin.getAddress(),
    mintAmount,
    undefined,
    logger,
  );
  const tokenContract = await TokenContract.at(tokenAddress, wallet);

  return {
    pxe,
    wallet,
    accounts: fundedAccounts.map(acc => acc.getAddress()),
    tokenAdminAddress: tokenAdmin.getAddress(),
    tokenName: TOKEN_NAME,
    tokenAddress,
    tokenContract,
    recipientAddress: recipientAccount.getAddress(),
  };
}

async function bridgeL1FeeJuice(
  l1RpcUrls: string[],
  mnemonicOrPrivateKey: string,
  pxe: PXE,
  node: AztecNode,
  recipient: AztecAddress,
  amount: bigint | undefined,
  log: Logger,
) {
  const { l1ChainId } = await pxe.getNodeInfo();
  const chain = createEthereumChain(l1RpcUrls, l1ChainId);
  const l1Client = createExtendedL1Client(chain.rpcUrls, mnemonicOrPrivateKey, chain.chainInfo);

  // docs:start:bridge_fee_juice
  const portal = await L1FeeJuicePortalManager.new(pxe, l1Client, log);
  const claim = await portal.bridgeTokensPublic(recipient, amount, true /* mint */);
  // docs:end:bridge_fee_juice

  const isSynced = async () => (await node.getL1ToL2MessageBlock(Fr.fromHexString(claim.messageHash))) !== undefined;
  await retryUntil(isSynced, `message ${claim.messageHash} sync`, 24, 0.5);

  log.info(`Created a claim for ${amount} L1 fee juice to ${recipient}.`, claim);
  return claim;
}

async function advanceL2Block(node: AztecNode, nodeAdmin?: AztecNodeAdmin) {
  const initialBlockNumber = await node.getBlockNumber();

  let minTxsPerBlock = undefined;
  if (nodeAdmin) {
    ({ minTxsPerBlock } = await nodeAdmin.getConfig());
    await nodeAdmin.setConfig({ minTxsPerBlock: 0 }); // Set to 0 to ensure we can advance the block
  }

  await retryUntil(async () => (await node.getBlockNumber()) >= initialBlockNumber + 1);

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

export async function startCompatiblePXE(
  nodeUrl: string,
  proverEnabled: boolean,
  logger: Logger,
): Promise<{ pxe: PXE; cleanup: () => Promise<void> }> {
  const node = createAztecNodeClient(nodeUrl);
  const [bbConfig, acvmConfig] = await Promise.all([getBBConfig(logger), getACVMConfig(logger)]);
  const pxe = await createPXEService(node, {
    dataDirectory: undefined,
    dataStoreMapSizeKB: 1024 * 1024,
    ...bbConfig,
    ...acvmConfig,
    proverEnabled,
  });

  return {
    pxe,
    async cleanup() {
      await pxe.stop();
      await bbConfig?.cleanup();
      await acvmConfig?.cleanup();
    },
  };
}
