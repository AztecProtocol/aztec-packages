import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import {
  type AccountWallet,
  type AccountWalletWithSecretKey,
  type AztecAddress,
  ExtendedNote,
  Fr,
  Note,
  type PXE,
  type TxHash,
  computeSecretHash,
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

const addPendingShieldNoteToPXE = async (args: {
  amount: bigint;
  secretHash: Fr;
  txHash: TxHash;
  accountAddress: AztecAddress;
  assetAddress: AztecAddress;
  wallet: AccountWallet;
}) => {
  const { accountAddress, assetAddress, amount, secretHash, txHash, wallet } = args;
  const note = new Note([new Fr(amount), secretHash]);
  const extendedNote = new ExtendedNote(
    note,
    accountAddress,
    assetAddress,
    TokenContract.storage.pending_shields.slot,
    TokenContract.notes.TransparentNote.id,
    txHash,
  );
  await wallet.addNote(extendedNote);
};

describe('token transfer test', () => {
  jest.setTimeout(10 * 60 * 1000); // 10 minutes

  const logger = createDebugLogger(`aztec:spartan-test:transfer`);
  const TOKEN_NAME = 'USDC';
  const TOKEN_SYMBOL = 'USD';
  const TOKEN_DECIMALS = 18n;
  const MINT_AMOUNT = 20n;

  const WALLET_COUNT = 1;
  const ROUNDS = 5n;

  let pxe: PXE;
  let wallets: AccountWalletWithSecretKey[];
  let recipientWallet: AccountWalletWithSecretKey;
  let tokenAddress: AztecAddress;
  let tokenAtWallet0: TokenContract;

  beforeAll(async () => {
    expect(ROUNDS).toBeLessThanOrEqual(MINT_AMOUNT);

    // My guess is that is never proven so if we are waiting for it to prove we wait forever?
    pxe = await createCompatibleClient(PXE_URL, logger);
    {
      const { accountKeys } = await addAccounts(1, logger, false)({ pxe });
      const accountManagers = accountKeys.map(ak => getSchnorrAccount(pxe, ak[0], ak[1], 1));

      const partialAddress = accountManagers[0].getCompleteAddress().partialAddress;
      await pxe.registerAccount(accountKeys[0][0], partialAddress);
      recipientWallet = await accountManagers[0].getWallet();
      logger.verbose(`Recipient Wallet address: ${recipientWallet.getAddress()} registered`);
    }

    const { accountKeys } = await addAccounts(Number(WALLET_COUNT), logger, false)({ pxe });
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
    tokenAtWallet0 = await TokenContract.at(tokenAddress, wallets[0]);

    logger.verbose(`Minting ${MINT_AMOUNT} public assets to the ${wallets.length} wallets...`);

    await Promise.all(
      wallets.map(w => tokenAtWallet0.methods.mint_public(w.getAddress(), MINT_AMOUNT).send().wait({ timeout: 600 })),
    );

    logger.verbose(`Minting ${MINT_AMOUNT} private assets to the ${wallets.length} wallets...`);
    const secrets: Fr[] = wallets.map(() => Fr.random());

    const txs = await Promise.all(
      wallets.map((w, i) =>
        tokenAtWallet0.methods.mint_private(MINT_AMOUNT, computeSecretHash(secrets[i])).send().wait({ timeout: 600 }),
      ),
    );

    wallets.forEach(async (wallet, i) => {
      await addPendingShieldNoteToPXE({
        amount: MINT_AMOUNT,
        secretHash: computeSecretHash(secrets[i]),
        txHash: txs[i].txHash,
        accountAddress: wallet.getAddress(),
        assetAddress: tokenAddress,
        wallet: wallet,
      });
    });

    await Promise.all(
      wallets.map(async (w, i) =>
        (await TokenContract.at(tokenAddress, w)).methods
          .redeem_shield(w.getAddress(), MINT_AMOUNT, secrets[i])
          .send()
          .wait({ timeout: 600 }),
      ),
    );

    logger.verbose(`Minting complete.`);
  });

  it('can get info', async () => {
    const name = toString(await tokenAtWallet0.methods.private_get_name().simulate());
    expect(name).toBe(TOKEN_NAME);
  });

  it('can transfer 1 token privately and publicly', async () => {
    const recipient = recipientWallet.getAddress();
    const transferAmount = 1n;

    wallets.forEach(async w => {
      expect(MINT_AMOUNT).toBe(
        await (await TokenContract.at(tokenAddress, w)).methods.balance_of_private(w.getAddress()).simulate(),
      );
      expect(MINT_AMOUNT).toBe(await tokenAtWallet0.methods.balance_of_public(w.getAddress()).simulate());
    });

    expect(0n).toBe(
      await (await TokenContract.at(tokenAddress, recipientWallet)).methods.balance_of_private(recipient).simulate(),
    );
    expect(0n).toBe(await tokenAtWallet0.methods.balance_of_public(recipient).simulate());

    // For each round, make both private and public transfers
    for (let i = 1n; i <= ROUNDS; i++) {
      const txs = await Promise.all([
        ...wallets.map(async w =>
          (await TokenContract.at(tokenAddress, w)).methods.transfer(recipient, transferAmount),
        ),
        ...wallets.map(async w =>
          (
            await TokenContract.at(tokenAddress, w)
          ).methods.transfer_public(w.getAddress(), recipient, transferAmount, 0),
        ),
      ]);

      txs.forEach(async t => await t.prove());

      await Promise.all(txs.map(t => t.send().wait({ timeout: 600 })));
    }

    wallets.forEach(async w => {
      expect(MINT_AMOUNT - ROUNDS * transferAmount).toBe(
        await (await TokenContract.at(tokenAddress, w)).methods.balance_of_private(w.getAddress()).simulate(),
      );
      expect(MINT_AMOUNT - ROUNDS * transferAmount).toBe(
        await tokenAtWallet0.methods.balance_of_public(w.getAddress()).simulate(),
      );
    });

    expect(ROUNDS * transferAmount * BigInt(wallets.length)).toBe(
      await (await TokenContract.at(tokenAddress, recipientWallet)).methods.balance_of_private(recipient).simulate(),
    );
    expect(ROUNDS * transferAmount * BigInt(wallets.length)).toBe(
      await tokenAtWallet0.methods.balance_of_public(recipient).simulate(),
    );
  });
});
