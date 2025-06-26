import { getSchnorrAccount, getSchnorrWalletWithSecretKey } from '@aztec/accounts/schnorr';
import { generateSchnorrAccounts, getDeployedTestAccountsWallets } from '@aztec/accounts/testing';
import {
  type AccountWalletWithSecretKey,
  type AztecAddress,
  type AztecNode,
  FeeJuicePaymentMethodWithClaim,
  type FeePaymentMethod,
  Fr,
  L1FeeJuicePortalManager,
  type PXE,
  SponsoredFeePaymentMethod,
  createAztecNodeClient,
  createCompatibleClient,
  retryUntil,
} from '@aztec/aztec.js';
import { createEthereumChain, createExtendedL1Client } from '@aztec/ethereum';
import type { Logger } from '@aztec/foundation/log';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { createPXEService } from '@aztec/pxe/server';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';

import { getACVMConfig } from '../fixtures/get_acvm_config.js';
import { getBBConfig } from '../fixtures/get_bb_config.js';
import { getSponsoredFPCAddress, registerSponsoredFPC } from '../fixtures/utils.js';

export interface TestWallets {
  pxe: PXE;
  wallets: AccountWalletWithSecretKey[];
  tokenAdminWallet: TokenContract;
  tokenName: string;
  recipientWallet: AccountWalletWithSecretKey;
  tokenAddress: AztecAddress;
}

const TOKEN_NAME = 'USDC';
const TOKEN_SYMBOL = 'USD';
const TOKEN_DECIMALS = 18n;

export async function setupTestWalletsWithTokens(
  pxeUrl: string,
  mintAmount: bigint,
  logger: Logger,
): Promise<TestWallets> {
  const WALLET_COUNT = 1; // TODO fix this to allow for 16 wallets again

  const pxe = await createCompatibleClient(pxeUrl, logger);

  const [recipientWallet, ...wallets] = (await getDeployedTestAccountsWallets(pxe)).slice(0, WALLET_COUNT + 1);

  const tokenAdmin = wallets[0];
  const tokenAddress = await deployTokenAndMint(wallets, tokenAdmin.getAddress(), mintAmount, undefined, logger);
  const tokenAdminWallet = await TokenContract.at(tokenAddress, tokenAdmin);

  return { pxe, wallets, tokenAdminWallet, tokenName: TOKEN_NAME, tokenAddress, recipientWallet };
}

export async function deploySponsoredTestWallets(
  pxe: PXE,
  mintAmount: bigint,
  logger: Logger,
  numberOfFundedWallets = 1,
): Promise<TestWallets> {
  const [recipient, ...funded] = await generateSchnorrAccounts(numberOfFundedWallets + 1);
  const recipientWallet = await getSchnorrWalletWithSecretKey(
    pxe,
    recipient.secret,
    recipient.signingKey,
    recipient.salt,
  );
  const fundedAccounts = await Promise.all(funded.map(a => getSchnorrAccount(pxe, a.secret, a.signingKey, a.salt)));

  await registerSponsoredFPC(pxe);

  const wallets = await Promise.all(
    fundedAccounts.map(async a => {
      const wallet = await a.getWallet();
      const paymentMethod = new SponsoredFeePaymentMethod(await getSponsoredFPCAddress());
      await a.deploy({ fee: { paymentMethod } }).wait({ timeout: 2400 }); // increase timeout on purpose in order to account for two empty epochs
      logger.info(`Account deployed at ${a.getAddress()}`);
      return wallet;
    }),
  );

  const tokenAdmin = wallets[0];
  const tokenAddress = await deployTokenAndMint(
    wallets,
    tokenAdmin.getAddress(),
    mintAmount,
    new SponsoredFeePaymentMethod(await getSponsoredFPCAddress()),
    logger,
  );
  const tokenAdminWallet = await TokenContract.at(tokenAddress, tokenAdmin);

  return { pxe, wallets, tokenAdminWallet, tokenName: TOKEN_NAME, tokenAddress, recipientWallet };
}

export async function deployTestWalletWithTokens(
  pxeUrl: string,
  nodeUrl: string,
  l1RpcUrls: string[],
  mnemonicOrPrivateKey: string,
  mintAmount: bigint,
  logger: Logger,
  numberOfFundedWallets = 1,
): Promise<TestWallets> {
  const pxe = await createCompatibleClient(pxeUrl, logger);
  const node = createAztecNodeClient(nodeUrl);

  const [recipient, ...funded] = await generateSchnorrAccounts(numberOfFundedWallets + 1);
  const recipientWallet = await getSchnorrWalletWithSecretKey(
    pxe,
    recipient.secret,
    recipient.signingKey,
    recipient.salt,
  );
  const fundedAccounts = await Promise.all(funded.map(a => getSchnorrAccount(pxe, a.secret, a.signingKey, a.salt)));

  const claims = await Promise.all(
    fundedAccounts.map(a => bridgeL1FeeJuice(l1RpcUrls, mnemonicOrPrivateKey, pxe, a.getAddress(), undefined, logger)),
  );

  // Progress by 3 L2 blocks so that the l1ToL2Message added above will be available to use on L2.
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
  const tokenAddress = await deployTokenAndMint(wallets, tokenAdmin.getAddress(), mintAmount, undefined, logger);
  const tokenAdminWallet = await TokenContract.at(tokenAddress, tokenAdmin);

  return { pxe, wallets, tokenAdminWallet, tokenName: TOKEN_NAME, tokenAddress, recipientWallet };
}

async function bridgeL1FeeJuice(
  l1RpcUrls: string[],
  mnemonicOrPrivateKey: string,
  pxe: PXE,
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

  const isSynced = async () => await pxe.isL1ToL2MessageSynced(Fr.fromHexString(claim.messageHash));
  await retryUntil(isSynced, `message ${claim.messageHash} sync`, 24, 0.5);

  log.info(`Created a claim for ${amount} L1 fee juice to ${recipient}.`, claim);
  return claim;
}

async function advanceL2Block(node: AztecNode, nodeAdmin?: AztecNodeAdmin) {
  const initialBlockNumber = await node.getBlockNumber();
  await nodeAdmin?.flushTxs();
  await retryUntil(async () => (await node.getBlockNumber()) >= initialBlockNumber + 1);
}

async function deployTokenAndMint(
  wallets: AccountWalletWithSecretKey[],
  admin: AztecAddress,
  mintAmount: bigint,
  paymentMethod: FeePaymentMethod | undefined,
  logger: Logger,
) {
  logger.verbose(`Deploying TokenContract...`);
  const tokenContract = await TokenContract.deploy(wallets[0], admin, TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS)
    .send({
      fee: {
        paymentMethod,
      },
    })
    .deployed({ timeout: 600 });

  const tokenAddress = tokenContract.address;

  logger.verbose(`Minting ${mintAmount} public assets to the ${wallets.length} wallets...`);

  await Promise.all(
    wallets.map(async w =>
      (await TokenContract.at(tokenAddress, w)).methods
        .mint_to_public(w.getAddress(), mintAmount)
        .send({ fee: { paymentMethod } })
        .wait({ timeout: 600 }),
    ),
  );

  logger.verbose(`Minting complete.`);

  return tokenAddress;
}

export async function performTransfers({
  testWallets,
  rounds,
  transferAmount,
  logger,
}: {
  testWallets: TestWallets;
  rounds: number;
  transferAmount: bigint;
  logger: Logger;
}) {
  const recipient = testWallets.recipientWallet.getAddress();

  for (let i = 0; i < rounds; i++) {
    const interactions = await Promise.all(
      testWallets.wallets.map(async w =>
        (await TokenContract.at(testWallets.tokenAddress, w)).methods.transfer_in_public(
          w.getAddress(),
          recipient,
          transferAmount,
          0,
        ),
      ),
    );

    const txs = await Promise.all(interactions.map(async i => await i.prove()));

    await Promise.all(txs.map(t => t.send().wait({ timeout: 600 })));

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
