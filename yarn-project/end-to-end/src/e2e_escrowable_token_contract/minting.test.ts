import { BITSIZE_TOO_BIG_ERROR, U128_OVERFLOW_ERROR } from '../fixtures/index.js';
import { EscrowTokenContractTest, toAddressOption } from './escrowable_token_contract_test.js';

describe('e2e_escrowable_token_contract mint', () => {
  const t = new EscrowTokenContractTest('mint');
  let { asset, tokenSim, wallets, blacklisted } = t;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    // Beware that we are adding the admin as minter here, which is very slow because it needs multiple blocks.
    await t.applyMintSnapshot();
    await t.setup();
    // Have to destructure again to ensure we have latest refs.
    ({ asset, tokenSim, wallets, blacklisted } = t);
  }, 300_000);

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
        ).rejects.toThrow("Assertion failed: Blacklisted: Recipient '!to_roles.is_blacklisted'");
      });
    });
  });

  describe('Private', () => {
    const amount = 10000n;

    describe('Mint flow', () => {
      it('mint_private as minter', async () => {
        const receipt = await asset.methods
          .mint_private(wallets[0].getAddress(), amount, toAddressOption(), toAddressOption())
          .send()
          .wait({ debug: true });
        tokenSim.mintAndRedeemPrivate(wallets[0].getAddress(), amount);
        // 1 note should be created containing `amount` of tokens
        const { visibleNotes } = receipt.debugInfo!;
        expect(visibleNotes.length).toBe(1);
        expect(visibleNotes[0].note.items[0].toBigInt()).toBe(amount);
      });
    });

    describe('failure cases', () => {
      it('mint_private as non-minter', async () => {
        await expect(
          asset
            .withWallet(wallets[1])
            .methods.mint_private(wallets[1].getAddress(), amount, toAddressOption(), toAddressOption())
            .prove(),
        ).rejects.toThrow('Assertion failed: caller is not minter');
      });

      it('mint >u128 tokens to overflow', async () => {
        const amount = 2n ** 128n; // U128::max() + 1;
        await expect(
          asset.methods.mint_private(wallets[0].getAddress(), amount, toAddressOption(), toAddressOption()).prove(),
        ).rejects.toThrow(BITSIZE_TOO_BIG_ERROR);
      });

      it('mint <u128 but recipient balance >u128', async () => {
        const amount = 2n ** 128n - tokenSim.balanceOfPrivate(wallets[0].getAddress());
        expect(amount).toBeLessThan(2n ** 128n);
        await expect(
          asset.methods.mint_private(wallets[0].getAddress(), amount, toAddressOption(), toAddressOption()).prove(),
        ).rejects.toThrow(U128_OVERFLOW_ERROR);
      });

      it('mint <u128 but such that total supply >u128', async () => {
        const amount = 2n ** 128n - tokenSim.totalSupply;
        await expect(
          asset.methods.mint_private(wallets[0].getAddress(), amount, toAddressOption(), toAddressOption()).prove(),
        ).rejects.toThrow(U128_OVERFLOW_ERROR);
      });
    });
  });
});
