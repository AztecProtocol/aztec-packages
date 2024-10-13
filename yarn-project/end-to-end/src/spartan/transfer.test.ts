import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import {
  type AccountWalletWithSecretKey,
  type AztecAddress,
  Fr,
  type PXE,
  createCompatibleClient,
} from '@aztec/aztec.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { TokenContract } from '@aztec/noir-contracts.js';

import { jest } from '@jest/globals';

import { addAccounts } from '../fixtures/snapshot_manager.js';

const { PXE_URL } = process.env;
if (!PXE_URL) {
  throw new Error('PXE_URL env variable must be set');
}

const toString = ({ value }: { value: bigint }) => {
  const vals: number[] = Array.from(new Fr(value).toBuffer());

  let str = '';
  for (let i = 0; i < vals.length; i++) {
    if (vals[i] != 0) {
      str += String.fromCharCode(Number(vals[i]));
    }
  }
  return str;
};

describe('token transfer test', () => {
  jest.setTimeout(10 * 60 * 2000); // 20 minutes

  const logger = createDebugLogger(`aztec:spartan-test:transfer`);
  const TOKEN_NAME = 'USDC';
  const TOKEN_SYMBOL = 'USD';
  const TOKEN_DECIMALS = 18n;
  const MINT_AMOUNT = 20n;

  const WALLET_COUNT = 1; // TODO fix this to allow for 16 wallets again
  const ROUNDS = 5n;

  let pxe: PXE;
  let wallets: AccountWalletWithSecretKey[];
  let recipientWallet: AccountWalletWithSecretKey;
  let tokenAddress: AztecAddress;
  let tokenAdminWallet: TokenContract;

  beforeAll(async () => {
    expect(ROUNDS).toBeLessThanOrEqual(MINT_AMOUNT);

    pxe = await createCompatibleClient(PXE_URL, logger);

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

    wallets = await Promise.all(
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

    tokenAddress = tokenContract.address;
    tokenAdminWallet = await TokenContract.at(tokenAddress, wallets[0]);

    logger.verbose(`Minting ${MINT_AMOUNT} public assets to the ${wallets.length} wallets...`);

    await Promise.all(
      wallets.map(w => tokenAdminWallet.methods.mint_public(w.getAddress(), MINT_AMOUNT).send().wait({ timeout: 600 })),
    );

    logger.verbose(`Minting complete.`);
  });

  it('can get info', async () => {
    const name = toString(await tokenAdminWallet.methods.private_get_name().simulate());
    expect(name).toBe(TOKEN_NAME);
  });

  it('can transfer 1 token privately and publicly', async () => {
    const recipient = recipientWallet.getAddress();
    const transferAmount = 1n;

    wallets.forEach(async w => {
      expect(MINT_AMOUNT).toBe(await tokenAdminWallet.methods.balance_of_public(w.getAddress()).simulate());
    });

    expect(0n).toBe(await tokenAdminWallet.methods.balance_of_public(recipient).simulate());

    // For each round, make both private and public transfers
    for (let i = 1n; i <= ROUNDS; i++) {
      const interactions = await Promise.all([
        ...wallets.map(async w =>
          (
            await TokenContract.at(tokenAddress, w)
          ).methods.transfer_public(w.getAddress(), recipient, transferAmount, 0),
        ),
      ]);

      const txs = await Promise.all(interactions.map(async i => await i.prove()));

      await Promise.all(txs.map(t => t.send().wait({ timeout: 600 })));
    }

    wallets.forEach(async w => {
      expect(MINT_AMOUNT - ROUNDS * transferAmount).toBe(
        await tokenAdminWallet.methods.balance_of_public(w.getAddress()).simulate(),
      );
    });

    expect(ROUNDS * transferAmount * BigInt(wallets.length)).toBe(
      await tokenAdminWallet.methods.balance_of_public(recipient).simulate(),
    );
  });
});
