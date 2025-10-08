import { Fr, type TxHash, computeSecretHash } from '@aztec/aztec.js';

import { BITSIZE_TOO_BIG_ERROR, U128_OVERFLOW_ERROR } from '../fixtures/index.js';
import { BlacklistTokenContractTest } from './blacklist_token_contract_test.js';

describe('e2e_blacklist_token_contract mint', () => {
  const t = new BlacklistTokenContractTest('mint');
  let { asset, tokenSim, adminAddress, otherAddress, blacklistedAddress } = t;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    // Beware that we are adding the admin as minter here, which is very slow because it needs multiple blocks.
    await t.applyMintSnapshot();
    await t.setup();
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

  describe('Public', () => {
    it('as minter', async () => {
      const amount = 10000n;
      tokenSim.mintPublic(adminAddress, amount);
      await asset.methods.mint_public(adminAddress, amount).send({ from: adminAddress }).wait();
    });

    describe('failure cases', () => {
      it('as non-minter', async () => {
        const amount = 10000n;
        await expect(asset.methods.mint_public(adminAddress, amount).simulate({ from: otherAddress })).rejects.toThrow(
          'Assertion failed: caller is not minter',
        );
      });

      // TODO(#12221): re-enable this test once we have proper unsigned integer overflow checks
      it.skip('mint >u128 tokens to overflow', async () => {
        const amount = 2n ** 128n; // u128::max() + 1;
        await expect(asset.methods.mint_public(adminAddress, amount).simulate({ from: adminAddress })).rejects.toThrow(
          BITSIZE_TOO_BIG_ERROR,
        );
      });

      it('mint <u128 but recipient balance >u128', async () => {
        const amount = 2n ** 128n - tokenSim.balanceOfPublic(adminAddress);
        await expect(asset.methods.mint_public(adminAddress, amount).simulate({ from: adminAddress })).rejects.toThrow(
          U128_OVERFLOW_ERROR,
        );
      });

      it('mint <u128 but such that total supply >u128', async () => {
        const amount = 2n ** 128n - tokenSim.balanceOfPublic(adminAddress);
        await expect(asset.methods.mint_public(otherAddress, amount).simulate({ from: adminAddress })).rejects.toThrow(
          U128_OVERFLOW_ERROR,
        );
      });

      it('mint to blacklisted entity', async () => {
        await expect(
          asset.methods.mint_public(blacklistedAddress, 1n).simulate({ from: adminAddress }),
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
        const balanceBefore = await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress });

        const receipt = await asset.methods.mint_private(amount, secretHash).send({ from: adminAddress }).wait();
        txHash = receipt.txHash;

        await t.addPendingShieldNoteToPXE(asset, adminAddress, amount, secretHash, txHash);

        await asset.methods.redeem_shield(adminAddress, amount, secret).send({ from: adminAddress }).wait();

        tokenSim.mintPrivate(adminAddress, amount);
        const balanceAfter = await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress });
        expect(balanceAfter).toBe(balanceBefore + amount);
      });
    });

    describe('failure cases', () => {
      it('try to redeem as recipient again (double-spend) [REVERTS]', async () => {
        // We have another wallet add the note to their PXE and then try to spend it. They will be able to successfully
        // add it, but PXE will realize that the note has been nullified already and not inject it into the circuit
        // during execution of redeem_shield, resulting in a simulation failure.

        await t.addPendingShieldNoteToPXE(asset, otherAddress, amount, secretHash, txHash);

        await expect(
          asset.methods.redeem_shield(otherAddress, amount, secret).simulate({ from: otherAddress }),
        ).rejects.toThrow(`Assertion failed: note not popped`);
      });

      it('mint_private as non-minter', async () => {
        await expect(asset.methods.mint_private(amount, secretHash).simulate({ from: otherAddress })).rejects.toThrow(
          'Assertion failed: caller is not minter',
        );
      });

      // TODO(#12221): re-enable this test once we have proper unsigned integer overflow checks
      it.skip('mint >u128 tokens to overflow', async () => {
        const amount = 2n ** 128n; // u128::max() + 1;
        await expect(asset.methods.mint_private(amount, secretHash).simulate({ from: adminAddress })).rejects.toThrow(
          BITSIZE_TOO_BIG_ERROR,
        );
      });

      it('mint <u128 but recipient balance >u128', async () => {
        const amount = 2n ** 128n - tokenSim.balanceOfPrivate(adminAddress);
        expect(amount).toBeLessThan(2n ** 128n);
        await expect(asset.methods.mint_private(amount, secretHash).simulate({ from: adminAddress })).rejects.toThrow(
          U128_OVERFLOW_ERROR,
        );
      });

      it('mint <u128 but such that total supply >u128', async () => {
        const amount = 2n ** 128n - tokenSim.totalSupply;
        await expect(asset.methods.mint_private(amount, secretHash).simulate({ from: adminAddress })).rejects.toThrow(
          U128_OVERFLOW_ERROR,
        );
      });

      it('mint and try to redeem at blacklist', async () => {
        await expect(
          asset.methods.redeem_shield(blacklistedAddress, amount, secret).simulate({ from: adminAddress }),
        ).rejects.toThrow('Assertion failed: Blacklisted: Recipient');
      });
    });
  });
});
