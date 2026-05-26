import { AUTOMINE_E2E_OPTS, U128_OVERFLOW_ERROR } from '../fixtures/fixtures.js';
import { TokenContractTest } from './token_contract_test.js';

describe('e2e_token_contract minting', () => {
  const t = new TokenContractTest('minting');
  let { asset, tokenSim, adminAddress, account1Address } = t;

  beforeAll(async () => {
    t.applyBaseSnapshots();
    await t.setup({ ...AUTOMINE_E2E_OPTS });
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
      await asset.methods.mint_to_public(adminAddress, amount).send({ from: adminAddress });

      tokenSim.mintPublic(adminAddress, amount);
      expect((await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress })).result).toEqual(
        tokenSim.balanceOfPublic(adminAddress),
      );
      expect((await asset.methods.total_supply().simulate({ from: adminAddress })).result).toEqual(
        tokenSim.totalSupply,
      );
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
      await asset.methods.mint_to_private(adminAddress, amount).send({ from: adminAddress });

      tokenSim.mintPrivate(adminAddress, amount);
      expect((await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress })).result).toEqual(
        tokenSim.balanceOfPrivate(adminAddress),
      );
      expect((await asset.methods.total_supply().simulate({ from: adminAddress })).result).toEqual(
        tokenSim.totalSupply,
      );
    });

    describe('failure cases', () => {
      it('as non-minter', async () => {
        const amount = 10000n;
        await expect(
          asset.methods.mint_to_private(adminAddress, amount).simulate({ from: account1Address }),
        ).rejects.toThrow('Assertion failed: caller is not minter');
      });

      // This test is expected to fail at the ABI encoder rather than during contract logic.
      // We keep the test to be defensive as it is the only e2e test with overflowed inputs.
      it('mint >u128 tokens to overflow', async () => {
        const overflowAmount = 2n ** 128n;
        await expect(
          asset.methods.mint_to_private(adminAddress, overflowAmount).simulate({ from: adminAddress }),
        ).rejects.toThrow('does not fit in u128');
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
