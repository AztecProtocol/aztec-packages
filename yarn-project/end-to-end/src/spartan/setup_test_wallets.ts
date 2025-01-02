import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { type AccountWalletWithSecretKey, type AztecAddress, type PXE, createCompatibleClient } from '@aztec/aztec.js';
import { type Logger } from '@aztec/foundation/log';
import { TokenContract } from '@aztec/noir-contracts.js/Token';

import { addAccounts } from '../fixtures/snapshot_manager.js';

export interface TestWallets {
  pxe: PXE;
  wallets: AccountWalletWithSecretKey[];
  tokenAdminWallet: TokenContract;
  tokenName: string;
  recipientWallet: AccountWalletWithSecretKey;
  tokenAddress: AztecAddress;
}

export async function setupTestWalletsWithTokens(
  pxeUrl: string,
  mintAmount: bigint,
  logger: Logger,
): Promise<TestWallets> {
  const TOKEN_NAME = 'USDC';
  const TOKEN_SYMBOL = 'USD';
  const TOKEN_DECIMALS = 18n;

  const WALLET_COUNT = 1; // TODO fix this to allow for 16 wallets again

  let recipientWallet: AccountWalletWithSecretKey;

  const pxe = await createCompatibleClient(pxeUrl, logger);

  {
    const { accountKeys } = await addAccounts(1, logger, false)({ pxe });
    const accountManagers = accountKeys.map(ak => getSchnorrAccount(pxe, ak[0], ak[1], 1));

    const partialAddress = accountManagers[0].getCompleteAddress().partialAddress;
    await pxe.registerAccount(accountKeys[0][0], partialAddress);
    recipientWallet = await accountManagers[0].getWallet();
    logger.verbose(`Recipient Wallet address: ${recipientWallet.getAddress()} registered`);
  }

  const { accountKeys } = await addAccounts(WALLET_COUNT, logger, false)({ pxe });
  const accountManagers = accountKeys.map(ak => getSchnorrAccount(pxe, ak[0], ak[1], 1));

  const wallets = await Promise.all(
    accountManagers.map(async (a, i) => {
      const partialAddress = a.getCompleteAddress().partialAddress;
      await pxe.registerAccount(accountKeys[i][0], partialAddress);
      const wallet = await a.getWallet();
      logger.verbose(`Wallet ${i} address: ${wallet.getAddress()} registered`);
      return wallet;
    }),
  );

  logger.verbose(`Deploying TokenContract...`);
  const tokenContract = await TokenContract.deploy(
    wallets[0],
    wallets[0].getAddress(),
    TOKEN_NAME,
    TOKEN_SYMBOL,
    TOKEN_DECIMALS,
  )
    .send()
    .deployed({ timeout: 600 });

  const tokenAddress = tokenContract.address;
  const tokenAdminWallet = await TokenContract.at(tokenAddress, wallets[0]);

  logger.verbose(`Minting ${mintAmount} public assets to the ${wallets.length} wallets...`);

  await Promise.all(
    wallets.map(w => tokenAdminWallet.methods.mint_to_public(w.getAddress(), mintAmount).send().wait({ timeout: 600 })),
  );

  logger.verbose(`Minting complete.`);

  return { pxe, wallets, tokenAdminWallet, tokenName: TOKEN_NAME, tokenAddress, recipientWallet };
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
        (
          await TokenContract.at(testWallets.tokenAddress, w)
        ).methods.transfer_in_public(w.getAddress(), recipient, transferAmount, 0),
      ),
    );

    const txs = await Promise.all(interactions.map(async i => await i.prove()));

    await Promise.all(txs.map(t => t.send().wait({ timeout: 600 })));

    logger.info(`Completed round ${i + 1} / ${rounds}`);
  }
}
