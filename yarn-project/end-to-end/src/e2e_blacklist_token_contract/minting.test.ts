import { Fr, type TxHash, computeSecretHash } from '@aztec/aztec.js';

import { BITSIZE_TOO_BIG_ERROR, U128_OVERFLOW_ERROR } from '../fixtures/index.js';
import { BlacklistTokenContractTest } from './blacklist_token_contract_test.js';

describe('e2e_blacklist_token_contract mint', () => {
  const t = new BlacklistTokenContractTest('mint');
  let { asset, tokenSim, wallets, blacklisted } = t;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    // Beware that we are adding the admin as minter here, which is very slow because it needs multiple blocks.
    await t.applyMintSnapshot();
    await t.setup();
    // Have to destructure again to ensure we have latest refs.
    ({ asset, tokenSim, wallets, blacklisted } = t);
  }, 600_000);

  afterAll(async () => {
    await t.teardown();
  });

  beforeEach(async () => {
    await t.tokenSim.check();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  describe('Public', () => {
    it('as minter', async () => {
      const amount = 10000n;
      tokenSim.mintPublic(wallets[0].getAddress(), amount);
      await asset.methods.mint_public(wallets[0].getAddress(), amount).send().wait();
    });

    describe('failure cases', () => {
      it('as non-minter', async () => {
        const amount = 10000n;
        await expect(
          asset.withWallet(wallets[1]).methods.mint_public(wallets[0].getAddress(), amount).prove(),
        ).rejects.toThrow('Assertion failed: caller is not minter');
      });

      it('mint >u128 tokens to overflow', async () => {
        const amount = 2n ** 128n; // U128::max() + 1;
        await expect(asset.methods.mint_public(wallets[0].getAddress(), amount).prove()).rejects.toThrow(
          BITSIZE_TOO_BIG_ERROR,
        );
      });

      it('mint <u128 but recipient balance >u128', async () => {
        const amount = 2n ** 128n - tokenSim.balanceOfPublic(wallets[0].getAddress());
        await expect(asset.methods.mint_public(wallets[0].getAddress(), amount).prove()).rejects.toThrow(
          U128_OVERFLOW_ERROR,
        );
      });

      it('mint <u128 but such that total supply >u128', async () => {
        const amount = 2n ** 128n - tokenSim.balanceOfPublic(wallets[0].getAddress());
        await expect(asset.methods.mint_public(wallets[1].getAddress(), amount).prove()).rejects.toThrow(
          U128_OVERFLOW_ERROR,
        );
      });

      it('mint to blacklisted entity', async () => {
        await expect(
          asset.withWallet(wallets[1]).methods.mint_public(blacklisted.getAddress(), 1n).prove(),
        ).rejects.toThrow(/Assertion failed: Blacklisted: Recipient/);
      });
    });
  });

  describe('Private', () => {
    const secret = Fr.random();
    const amount = 10000n;
    let secretHash: Fr;
    let txHash: TxHash;

    beforeAll(async () => {
      secretHash = await computeSecretHash(secret);
    });

    describe('Mint flow', () => {
      it('mint_private as minter and redeem as recipient', async () => {
        const receipt = await asset.methods.mint_private(amount, secretHash).send().wait();
        txHash = receipt.txHash;

        await t.addPendingShieldNoteToPXE(asset, wallets[0], amount, secretHash, txHash);

        const receiptClaim = await asset.methods
          .redeem_shield(wallets[0].getAddress(), amount, secret)
          .send()
          .wait({ debug: true });

        tokenSim.mintPrivate(wallets[0].getAddress(), amount);
        // Trigger a note sync
        await asset.methods.sync_notes().simulate();
        // 1 note should have been created containing `amount` of tokens
        const visibleNotes = await wallets[0].getNotes({ txHash: receiptClaim.txHash });
        expect(visibleNotes.length).toBe(1);
        expect(visibleNotes[0].note.items[0].toBigInt()).toBe(amount);
      });
    });

    describe('failure cases', () => {
      it('try to redeem as recipient again (double-spend) [REVERTS]', async () => {
        // We have another wallet add the note to their PXE and then try to spend it. They will be able to successfully
        // add it, but PXE will realize that the note has been nullified already and not inject it into the circuit
        // during execution of redeem_shield, resulting in a simulaton failure.

        await t.addPendingShieldNoteToPXE(asset, wallets[1], amount, secretHash, txHash);

        await expect(
          asset.withWallet(wallets[1]).methods.redeem_shield(wallets[1].getAddress(), amount, secret).prove(),
        ).rejects.toThrow(`Assertion failed: note not popped 'notes.len() == 1'`);
      });

      it('mint_private as non-minter', async () => {
        await expect(asset.withWallet(wallets[1]).methods.mint_private(amount, secretHash).prove()).rejects.toThrow(
          'Assertion failed: caller is not minter',
        );
      });

      it('mint >u128 tokens to overflow', async () => {
        const amount = 2n ** 128n; // U128::max() + 1;
        await expect(asset.methods.mint_private(amount, secretHash).prove()).rejects.toThrow(BITSIZE_TOO_BIG_ERROR);
      });

      it('mint <u128 but recipient balance >u128', async () => {
        const amount = 2n ** 128n - tokenSim.balanceOfPrivate(wallets[0].getAddress());
        expect(amount).toBeLessThan(2n ** 128n);
        await expect(asset.methods.mint_private(amount, secretHash).prove()).rejects.toThrow(U128_OVERFLOW_ERROR);
      });

      it('mint <u128 but such that total supply >u128', async () => {
        const amount = 2n ** 128n - tokenSim.totalSupply;
        await expect(asset.methods.mint_private(amount, secretHash).prove()).rejects.toThrow(U128_OVERFLOW_ERROR);
      });

      it('mint and try to redeem at blacklist', async () => {
        await expect(asset.methods.redeem_shield(blacklisted.getAddress(), amount, secret).prove()).rejects.toThrow(
          /Assertion failed: Blacklisted: Recipient .*/,
        );
      });
    });
  });
});
