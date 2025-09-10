import { U128_OVERFLOW_ERROR } from '../fixtures/fixtures.js';
import { TokenContractTest } from './token_contract_test.js';

describe('e2e_token_contract minting', () => {
  const t = new TokenContractTest('minting');
  let { asset, tokenSim, adminAddress, account1Address } = t;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.setup();
    ({ asset, tokenSim, adminAddress, account1Address } = t);
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
      await asset.methods.mint_to_public(adminAddress, amount).send({ from: adminAddress }).wait();

      tokenSim.mintPublic(adminAddress, amount);
      expect(await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress })).toEqual(
        tokenSim.balanceOfPublic(adminAddress),
      );
      expect(await asset.methods.total_supply().simulate({ from: adminAddress })).toEqual(tokenSim.totalSupply);
    });

    describe('failure cases', () => {
      it('as non-minter', async () => {
        const amount = 10000n;
        await expect(
          asset.methods.mint_to_public(adminAddress, amount).simulate({ from: account1Address }),
        ).rejects.toThrow('Assertion failed: caller is not minter');
      });

      it('mint <u128 but recipient balance >u128', async () => {
        const amount = 2n ** 128n - tokenSim.balanceOfPublic(adminAddress);
        await expect(
          asset.methods.mint_to_public(adminAddress, amount).simulate({ from: adminAddress }),
        ).rejects.toThrow(U128_OVERFLOW_ERROR);
      });

      it('mint <u128 but such that total supply >u128', async () => {
        const amount = 2n ** 128n - tokenSim.balanceOfPublic(adminAddress);
        await expect(
          asset.methods.mint_to_public(account1Address, amount).simulate({ from: adminAddress }),
        ).rejects.toThrow(U128_OVERFLOW_ERROR);
      });
    });
  });

  describe('Private', () => {
    it('as minter', async () => {
      const amount = 10000n;
      await asset.methods.mint_to_private(adminAddress, amount).send({ from: adminAddress }).wait();

      tokenSim.mintPrivate(adminAddress, amount);
      expect(await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress })).toEqual(
        tokenSim.balanceOfPrivate(adminAddress),
      );
      expect(await asset.methods.total_supply().simulate({ from: adminAddress })).toEqual(tokenSim.totalSupply);
    });

    describe('failure cases', () => {
      it('as non-minter', async () => {
        const amount = 10000n;
        await expect(
          asset.methods.mint_to_private(adminAddress, amount).simulate({ from: account1Address }),
        ).rejects.toThrow('Assertion failed: caller is not minter');
      });

      it('mint >u128 tokens to overflow', async () => {
        const overflowAmount = 2n ** 128n;

        await expect(
          asset.methods.mint_to_private(adminAddress, overflowAmount).simulate({ from: adminAddress }),
        ).rejects.toThrow('Cannot satisfy constraint');
      });

      it('mint <u128 but recipient balance >u128', async () => {
        const amount = 2n ** 128n - tokenSim.balanceOfPrivate(adminAddress);
        await expect(
          asset.methods.mint_to_private(adminAddress, amount).simulate({ from: adminAddress }),
        ).rejects.toThrow(U128_OVERFLOW_ERROR);
      });

      it('mint <u128 but such that total supply >u128', async () => {
        const amount = 2n ** 128n - tokenSim.balanceOfPrivate(adminAddress);
        await expect(
          asset.methods.mint_to_private(account1Address, amount).simulate({ from: adminAddress }),
        ).rejects.toThrow(U128_OVERFLOW_ERROR);
      });
    });
  });
});
