import { generateSchnorrAccounts } from '@aztec/accounts/testing';
import { NO_FROM } from '@aztec/aztec.js/account';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { L1FeeJuicePortalManager } from '@aztec/aztec.js/ethereum';
import { FeeJuicePaymentMethodWithClaim } from '@aztec/aztec.js/fee';
import { type FeePaymentMethod, SponsoredFeePaymentMethod } from '@aztec/aztec.js/fee';
import { Fr } from '@aztec/aztec.js/fields';
import { waitForL1ToL2MessageReady } from '@aztec/aztec.js/messaging';
import { type AztecNode, createAztecNodeClient, waitForTx } from '@aztec/aztec.js/node';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { createEthereumChain } from '@aztec/ethereum/chain';
import { createExtendedL1Client } from '@aztec/ethereum/client';
import type { Logger } from '@aztec/foundation/log';
import { makeBackoff, retry, retryUntil } from '@aztec/foundation/retry';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { Gas } from '@aztec/stdlib/gas';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
<<<<<<< HEAD
import { TxStatus } from '@aztec/stdlib/tx';
=======
import { getGasLimits } from '@aztec/wallet-sdk/base-wallet';
>>>>>>> ab5413c72dc (feat: merge-train/spartan-v5 (#23975))
import { registerInitialLocalNetworkAccountsInWallet } from '@aztec/wallets/testing';

import { getACVMConfig } from '../fixtures/get_acvm_config.js';
import { getBBConfig } from '../fixtures/get_bb_config.js';
import { getSponsoredFPCAddress, registerSponsoredFPC } from '../fixtures/utils.js';
import { TestWallet } from '../test-wallet/test_wallet.js';
import { proveInteraction } from '../test-wallet/utils.js';
import { WorkerWallet } from '../test-wallet/worker_wallet.js';

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

export type TestAccountsWithoutTokens = Omit<
  TestAccounts,
  'tokenAddress' | 'tokenContract' | 'tokenName' | 'tokenAdminAddress'
>;

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

  const [recipientAccount, ...accounts] = (await registerInitialLocalNetworkAccountsInWallet(wallet)).slice(
    0,
    ACCOUNT_COUNT + 1,
  );

  const tokenAdmin = accounts[0];
  const tokenAddress = await deployTokenAndMint(wallet, accounts, tokenAdmin, mintAmount, undefined, logger);
  const tokenContract = TokenContract.at(tokenAddress, wallet);

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

export async function deploySponsoredTestAccountsWithTokens(
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
  await recipientDeployMethod.send({
    from: NO_FROM,
    fee: { paymentMethod },
    wait: { timeout: 2400 },
  });
  await Promise.all(
    fundedAccounts.map(async a => {
      const deployMethod = await a.getDeployMethod();
      await deployMethod.send({
        from: NO_FROM,
        fee: { paymentMethod },
        wait: { timeout: 2400 },
      }); // increase timeout on purpose in order to account for two empty epochs
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
  const tokenContract = TokenContract.at(tokenAddress, wallet);

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

async function deployAccountWithDiagnostics(
  account: { getDeployMethod: () => Promise<{ simulate: (opts: any) => any; send: (opts: any) => any }>; address: any },
  paymentMethod: SponsoredFeePaymentMethod,
  aztecNode: AztecNode,
  logger: Logger,
  accountLabel: string,
  estimateGas?: boolean,
): Promise<void> {
  const deployMethod = await account.getDeployMethod();
  let gasSettings: any;
  if (estimateGas) {
    const sim = await deployMethod.simulate({ from: NO_FROM, fee: { paymentMethod }, includeMetadata: true });
    const { txsLimits } = await aztecNode.getNodeInfo();
    gasSettings = getGasLimits(sim.gasUsed!, Gas.from(txsLimits.gas));
    logger.info(`${accountLabel} estimated gas: DA=${gasSettings.gasLimits.daGas} L2=${gasSettings.gasLimits.l2Gas}`);
  }

  // Track the tx hash across retries so we don't re-send when the previous tx is still pending.
  let sentTxHash: { txHash: any } | undefined;

  await retry(
    async () => {
      // Check if already deployed (handles case where previous attempt succeeded but waitForTx timed out)
      const existing = await aztecNode.getContract(account.address);
      if (existing) {
        logger.info(`${accountLabel} already deployed at ${account.address}, skipping`);
        return;
      }

      // If we already sent a tx, check if it was dropped before deciding to re-send.
      if (sentTxHash) {
        const prevReceipt = await aztecNode.getTxReceipt(sentTxHash.txHash);
        if (prevReceipt.isDropped()) {
          logger.info(`${accountLabel} previous tx ${sentTxHash.txHash} was dropped, re-sending`);
          sentTxHash = undefined;
        } else {
          logger.info(`${accountLabel} previous tx ${sentTxHash.txHash} still pending, waiting again...`);
        }
      }

      if (!sentTxHash) {
        const deployResult = await deployMethod.send({
          from: NO_FROM,
          fee: { paymentMethod, gasSettings },
          wait: NO_WAIT,
        });
        sentTxHash = { txHash: deployResult.txHash };
        logger.info(`${accountLabel} tx sent`, { txHash: sentTxHash.txHash.toString() });
      }

      const receipt = await waitForTx(aztecNode, sentTxHash.txHash, { timeout: 600 });
      if (receipt.isDropped()) {
        sentTxHash = undefined;
        throw new Error(`${accountLabel} tx was dropped, retrying...`);
      }
      logger.info(`${accountLabel} deployed at ${account.address}`);
    },
    `deploy ${accountLabel}`,
    makeBackoff([1, 2, 4, 8, 16]),
    logger,
  );
}

async function deployAccountsInBatches(
  accounts: {
    getDeployMethod: () => Promise<{ simulate: (opts: any) => any; send: (opts: any) => any }>;
    address: any;
  }[],
  paymentMethod: SponsoredFeePaymentMethod,
  aztecNode: AztecNode,
  logger: Logger,
  labelPrefix: string,
  batchSize = 2,
  estimateGas?: boolean,
): Promise<void> {
  for (let i = 0; i < accounts.length; i += batchSize) {
    const batch = accounts.slice(i, i + batchSize);
    await Promise.all(
      batch.map((account, idx) =>
        deployAccountWithDiagnostics(
          account,
          paymentMethod,
          aztecNode,
          logger,
          `${labelPrefix}${i + idx + 1}`,
          estimateGas,
        ),
      ),
    );
  }
}

export async function deploySponsoredTestAccounts(
  wallet: TestWallet,
  aztecNode: AztecNode,
  logger: Logger,
  numberOfFundedWallets = 1,
  opts?: { estimateGas?: boolean },
): Promise<TestAccountsWithoutTokens> {
  const [recipient, ...funded] = await generateSchnorrAccounts(numberOfFundedWallets + 1);
  const recipientAccount = await wallet.createSchnorrAccount(recipient.secret, recipient.salt);
  const fundedAccounts = await Promise.all(funded.map(a => wallet.createSchnorrAccount(a.secret, a.salt)));

  await registerSponsoredFPC(wallet);

  const paymentMethod = new SponsoredFeePaymentMethod(await getSponsoredFPCAddress());

  await deployAccountWithDiagnostics(
    recipientAccount,
    paymentMethod,
    aztecNode,
    logger,
    'Recipient account',
    opts?.estimateGas,
  );
  await deployAccountsInBatches(
    fundedAccounts,
    paymentMethod,
    aztecNode,
    logger,
    'Funded account ',
    2,
    opts?.estimateGas,
  );

  return {
    aztecNode,
    wallet,
    accounts: fundedAccounts.map(acc => acc.address),
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
      await deployMethod.send({ from: NO_FROM, fee: { paymentMethod } });
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
  const tokenContract = TokenContract.at(tokenAddress, wallet);

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

  await waitForL1ToL2MessageReady(aztecNode, Fr.fromHexString(claim.messageHash), { timeoutSeconds: 24 });

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
  const { contract: tokenContract } = await TokenContract.deploy(
    wallet,
    admin,
    TOKEN_NAME,
    TOKEN_SYMBOL,
    TOKEN_DECIMALS,
  ).send({
    from: admin,
    fee: {
      paymentMethod,
    },
    wait: { timeout: 600 },
  });

  const tokenAddress = tokenContract.address;

  logger.verbose(`Minting ${mintAmount} public assets to the ${accounts.length} accounts...`);

  await Promise.all(
    accounts.map(acc =>
      TokenContract.at(tokenAddress, wallet)
        .methods.mint_to_public(acc, mintAmount)
        .send({ from: admin, fee: { paymentMethod }, wait: { timeout: 600 } }),
    ),
  );

  logger.verbose(`Minting complete.`);

  return tokenAddress;
}

export async function performTransfers({
  wallet,
  testAccounts,
  rounds,
  transferAmount,
  logger,
  feePaymentMethod,
}: {
  wallet: TestWallet;
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
    const txs = testAccounts.accounts.map(acc => {
      const token = TokenContract.at(testAccounts.tokenAddress, testAccounts.wallet);
      return proveInteraction(wallet, token.methods.transfer_in_public(acc, recipient, transferAmount, 0), {
        from: acc,
        fee: {
          paymentMethod: defaultFeePaymentMethod,
        },
      });
    });

    const provenTxs = await Promise.all(txs);

    // Wait only for the txs to be proposed, not checkpointed. This is enough to keep the chain
    // loaded for the reorg scenario, and avoids each round blocking on the (slower) checkpoint lag.
    await Promise.all(provenTxs.map(t => t.send({ wait: { timeout: 600, waitForStatus: TxStatus.PROPOSED } })));

    logger.info(`Completed round ${i + 1} / ${rounds}`);
  }
}

export type WalletWrapper = {
  wallet: TestWallet;
  aztecNode: AztecNode;
  cleanup: () => Promise<void>;
};

export async function createWalletAndAztecNodeClient(
  nodeUrl: string,
  proverEnabled: boolean,
  logger: Logger,
): Promise<WalletWrapper> {
  const aztecNode = createAztecNodeClient(nodeUrl);
  const [bbConfig, acvmConfig] = await Promise.all([getBBConfig(logger), getACVMConfig(logger)]);
  const pxeConfig = {
    dataDirectory: undefined,
    dataStoreMapSizeKb: 1024 * 1024,
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

export type WorkerWalletWrapper = {
  wallet: WorkerWallet;
  aztecNode: AztecNode;
  cleanup: () => Promise<void>;
};

export async function createWorkerWalletClient(
  nodeUrl: string,
  proverEnabled: boolean,
  logger: Logger,
): Promise<WorkerWalletWrapper> {
  const aztecNode = createAztecNodeClient(nodeUrl);
  const [bbConfig, acvmConfig] = await Promise.all([getBBConfig(logger), getACVMConfig(logger)]);

  // Strip cleanup functions — they can't be structured-cloned for worker transfer
  const { cleanup: bbCleanup, ...bbPaths } = bbConfig ?? {};
  const { cleanup: acvmCleanup, ...acvmPaths } = acvmConfig ?? {};

  const pxeConfig = {
    dataDirectory: undefined,
    dataStoreMapSizeKb: 1024 * 1024,
    ...bbPaths,
    ...acvmPaths,
    proverEnabled,
  };

  const wallet = await WorkerWallet.create(nodeUrl, pxeConfig);

  return {
    wallet,
    aztecNode,
    async cleanup() {
      await wallet.stop();
      await bbCleanup?.();
      await acvmCleanup?.();
    },
  };
}
