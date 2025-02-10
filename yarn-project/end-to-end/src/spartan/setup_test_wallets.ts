import { getDeployedTestAccountsWallets } from '@aztec/accounts/testing';
import { type AccountWalletWithSecretKey, type AztecAddress, type PXE, createCompatibleClient } from '@aztec/aztec.js';
import { type Logger } from '@aztec/foundation/log';
import { TokenContract } from '@aztec/noir-contracts.js/Token';

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

  const pxe = await createCompatibleClient(pxeUrl, logger);

  const [recipientWallet, ...wallets] = (await getDeployedTestAccountsWallets(pxe)).slice(0, WALLET_COUNT + 1);

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
