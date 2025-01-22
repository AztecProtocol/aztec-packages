import { U128_OVERFLOW_ERROR } from '../fixtures/fixtures.js';
import { TokenContractTest } from './token_contract_test.js';

describe('e2e_token_contract minting', () => {
  const t = new TokenContractTest('minting');
  let { asset, accounts, tokenSim, wallets } = t;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.setup();
    ({ asset, accounts, tokenSim, wallets } = t);
  });

  afterAll(async () => {
    await t.teardown();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  describe('Public', () => {
    it('as minter', async () => {
      const amount = 10000n;
      await asset.methods.mint_to_public(accounts[0].address, amount).send().wait();

      tokenSim.mintPublic(accounts[0].address, amount);
      expect(await asset.methods.balance_of_public(accounts[0].address).simulate()).toEqual(
        tokenSim.balanceOfPublic(accounts[0].address),
      );
      expect(await asset.methods.total_supply().simulate()).toEqual(tokenSim.totalSupply);
    });

    describe('failure cases', () => {
      it('as non-minter', async () => {
        const amount = 10000n;
        await expect(
          asset.withWallet(wallets[1]).methods.mint_to_public(accounts[0].address, amount).simulate(),
        ).rejects.toThrow('Assertion failed: caller is not minter');
      });

      it('mint >u128 tokens to overflow', async () => {
        const maxAmountWithoutOverflow = 2n ** 128n - 1n - tokenSim.balanceOfPublic(accounts[0].address);

        // First we send a valid tx because if we minted with "amount > U128::max()" we would get an error in U128
        // in encoder.ts
        await asset.methods.mint_to_public(accounts[0].address, maxAmountWithoutOverflow).send().wait();
        tokenSim.mintPublic(accounts[0].address, maxAmountWithoutOverflow);

        // Then we try to mint 1 to cause the U128 overflow inside the contract
        await expect(asset.methods.mint_to_public(accounts[0].address, 1n).simulate()).rejects.toThrow(
          U128_OVERFLOW_ERROR,
        );
      });

      it('mint <u128 but recipient balance >u128', async () => {
        const amount = 2n ** 128n - tokenSim.balanceOfPublic(accounts[0].address);
        await expect(asset.methods.mint_to_public(accounts[0].address, amount).simulate()).rejects.toThrow(
          U128_OVERFLOW_ERROR,
        );
      });

      it('mint <u128 but such that total supply >u128', async () => {
        const amount = 2n ** 128n - tokenSim.balanceOfPublic(accounts[0].address);
        await expect(asset.methods.mint_to_public(accounts[1].address, amount).simulate()).rejects.toThrow(
          U128_OVERFLOW_ERROR,
        );
      });
    });
  });
});
