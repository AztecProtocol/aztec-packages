import { TestClass } from './test_class.js';

// const { E2E_DATA_PATH: dataPath = './data' } = process.env;

describe('e2e_token_contract', () => {
  const t = new TestClass('access_control');

  beforeAll(async () => {
    await t.setup();
  });

  beforeEach(async () => {
    await t.snapshotManager.setup();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  afterAll(async () => {
    await t.snapshotManager.teardown();
  });

  describe('Access controlled functions', () => {
    it('Set admin', async () => {
      await t.asset.methods.set_admin(t.accounts[1].address).send().wait();
      expect(await t.asset.methods.admin().view()).toBe(t.accounts[1].address.toBigInt());
    });

    it('Add minter as admin', async () => {
      await t.asset.withWallet(t.wallets[1]).methods.set_minter(t.accounts[1].address, true).send().wait();
      expect(await t.asset.methods.is_minter(t.accounts[1].address).view()).toBe(true);
    });

    it('Revoke minter as admin', async () => {
      await t.asset.withWallet(t.wallets[1]).methods.set_minter(t.accounts[1].address, false).send().wait();
      expect(await t.asset.methods.is_minter(t.accounts[1].address).view()).toBe(false);
    });

    describe('failure cases', () => {
      it('Set admin (not admin)', async () => {
        await expect(t.asset.methods.set_admin(t.accounts[0].address).simulate()).rejects.toThrow(
          'Assertion failed: caller is not admin',
        );
      });
      it('Revoke minter not as admin', async () => {
        await expect(t.asset.methods.set_minter(t.accounts[0].address, false).simulate()).rejects.toThrow(
          'Assertion failed: caller is not admin',
        );
      });
    });
  });
});
