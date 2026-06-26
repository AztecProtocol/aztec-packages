import { computeSecretHash } from '@aztec/aztec.js/crypto';
import { Fr } from '@aztec/aztec.js/fields';
import type { TxHash } from '@aztec/aztec.js/tx';

import { U128_OVERFLOW_ERROR } from '../../fixtures/index.js';
import { BlacklistTokenContractTest } from './blacklist_token_contract_test.js';

// Covers public and private minting on TokenBlacklist, including minter role enforcement and blacklist
// restrictions on recipients. Setup: single node with AutomineSequencer, 3 accounts, TokenBlacklist
// deployed with initial balances (applyMint). Role-change delay requires time-warp during setup.
describe('automine/token/blacklist_minting', () => {
  const t = new BlacklistTokenContractTest('mint');
  let { asset, tokenSim, adminAddress, otherAddress, blacklistedAddress } = t;

  beforeAll(async () => {
    await t.setup();
    // Beware that we are adding the admin as minter here, which is very slow because it needs multiple blocks.
    await t.applyMint();
    // Have to destructure again to ensure we have latest refs.
    ({ asset, tokenSim, adminAddress, otherAddress, blacklistedAddress } = t);
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

  // Public mint path: success and failure cases including overflow and blacklist enforcement.
  describe('Public', () => {
    // Mints 10000 tokens publicly as the admin-minter and verifies balance via TokenSimulator.
    it('as minter', async () => {
      const amount = 10000n;
      tokenSim.mintPublic(adminAddress, amount);
      await asset.methods.mint_public(adminAddress, amount).send({ from: adminAddress });
    });

    // Error paths: non-minter, overflow (recipient balance), overflow (total supply), blacklisted recipient.
    describe('failure cases', () => {
      // Attempts mint_public from otherAddress (not a minter) and expects 'caller is not minter'.
      it('as non-minter', async () => {
        const amount = 10000n;
        await expect(asset.methods.mint_public(adminAddress, amount).simulate({ from: otherAddress })).rejects.toThrow(
          'Assertion failed: caller is not minter',
        );
      });

      // Mints an amount that would overflow the recipient's u128 balance; expects U128_OVERFLOW_ERROR.
      it('mint <u128 but recipient balance >u128', async () => {
        const amount = 2n ** 128n - tokenSim.balanceOfPublic(adminAddress);
        await expect(asset.methods.mint_public(adminAddress, amount).simulate({ from: adminAddress })).rejects.toThrow(
          U128_OVERFLOW_ERROR,
        );
      });

      // Mints an amount that would overflow total supply across different recipients; expects U128_OVERFLOW_ERROR.
      it('mint <u128 but such that total supply >u128', async () => {
        const amount = 2n ** 128n - tokenSim.balanceOfPublic(adminAddress);
        await expect(asset.methods.mint_public(otherAddress, amount).simulate({ from: adminAddress })).rejects.toThrow(
          U128_OVERFLOW_ERROR,
        );
      });

      // Tries to mint to the blacklisted account and expects the 'Blacklisted: Recipient' assertion.
      it('mint to blacklisted entity', async () => {
        await expect(
          asset.methods.mint_public(blacklistedAddress, 1n).simulate({ from: adminAddress }),
        ).rejects.toThrow(/Assertion failed: Blacklisted: Recipient/);
      });
    });
  });

  // Private mint path: mint_private + redeem_shield flow, plus failure cases.
  describe('Private', () => {
    const secret = Fr.random();
    const amount = 10000n;
    let secretHash: Fr;
    let txHash: TxHash;

    beforeAll(async () => {
      secretHash = await computeSecretHash(secret);
    });

    // Happy path for private minting: mint, register the pending shield note in PXE, and redeem.
    describe('Mint flow', () => {
      // Mints privately as admin-minter, adds the pending shield note to PXE, redeems it, and checks balance.
      it('mint_private as minter and redeem as recipient', async () => {
        const { result: balanceBefore } = await asset.methods
          .balance_of_private(adminAddress)
          .simulate({ from: adminAddress });

        const { receipt } = await asset.methods.mint_private(amount, secretHash).send({ from: adminAddress });
        txHash = receipt.txHash;

        await t.addPendingShieldNoteToPXE(asset, adminAddress, amount, secretHash, txHash);

        await asset.methods.redeem_shield(adminAddress, amount, secret).send({ from: adminAddress });

        tokenSim.mintPrivate(adminAddress, amount);
        const { result: balanceAfter } = await asset.methods
          .balance_of_private(adminAddress)
          .simulate({ from: adminAddress });
        expect(balanceAfter).toBe(balanceBefore + amount);
      });
    });

    // Error paths for private minting: double-spend, non-minter, overflow, blacklist on redeem.
    describe('failure cases', () => {
      // Adds the already-redeemed shield note to a second account's PXE and expects 'note not popped' on simulate.
      it('try to redeem as recipient again (double-spend) [REVERTS]', async () => {
        // We have another wallet add the note to their PXE and then try to spend it. They will be able to successfully
        // add it, but PXE will realize that the note has been nullified already and not inject it into the circuit
        // during execution of redeem_shield, resulting in a simulation failure.

        await t.addPendingShieldNoteToPXE(asset, otherAddress, amount, secretHash, txHash);

        await expect(
          asset.methods.redeem_shield(otherAddress, amount, secret).simulate({ from: otherAddress }),
        ).rejects.toThrow(`Assertion failed: note not popped`);
      });

      // Attempts mint_private from otherAddress (not a minter) and expects 'caller is not minter'.
      it('mint_private as non-minter', async () => {
        await expect(asset.methods.mint_private(amount, secretHash).simulate({ from: otherAddress })).rejects.toThrow(
          'Assertion failed: caller is not minter',
        );
      });

      // Mints an amount that would overflow the recipient's private u128 balance; expects U128_OVERFLOW_ERROR.
      it('mint <u128 but recipient balance >u128', async () => {
        const amount = 2n ** 128n - tokenSim.balanceOfPrivate(adminAddress);
        expect(amount).toBeLessThan(2n ** 128n);
        await expect(asset.methods.mint_private(amount, secretHash).simulate({ from: adminAddress })).rejects.toThrow(
          U128_OVERFLOW_ERROR,
        );
      });

      // Mints an amount that would overflow total supply (private path); expects U128_OVERFLOW_ERROR.
      it('mint <u128 but such that total supply >u128', async () => {
        const amount = 2n ** 128n - tokenSim.totalSupply;
        await expect(asset.methods.mint_private(amount, secretHash).simulate({ from: adminAddress })).rejects.toThrow(
          U128_OVERFLOW_ERROR,
        );
      });

      // Attempts redeem_shield targeting blacklistedAddress and expects 'Blacklisted: Recipient'.
      it('mint and try to redeem at blacklist', async () => {
        await expect(
          asset.methods.redeem_shield(blacklistedAddress, amount, secret).simulate({ from: adminAddress }),
        ).rejects.toThrow('Assertion failed: Blacklisted: Recipient');
      });
    });
  });
});
