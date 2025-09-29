import { TokenContractTest } from './token_contract_test.js';

describe('e2e_token_contract access control', () => {
  const t = new TokenContractTest('access_control');

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.setup();
  });

  afterAll(async () => {
    await t.teardown();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  it('Set admin', async () => {
    await t.asset.methods.set_admin(t.account1Address).send({ from: t.adminAddress }).wait();
    expect(await t.asset.methods.get_admin().simulate({ from: t.adminAddress })).toBe(t.account1Address.toBigInt());
  });

  it('Add minter as admin', async () => {
    await t.asset.methods.set_minter(t.account1Address, true).send({ from: t.account1Address }).wait();
    expect(await t.asset.methods.is_minter(t.account1Address).simulate({ from: t.adminAddress })).toBe(true);
  });

  it('Revoke minter as admin', async () => {
    await t.asset.methods.set_minter(t.account1Address, false).send({ from: t.account1Address }).wait();
    expect(await t.asset.methods.is_minter(t.account1Address).simulate({ from: t.adminAddress })).toBe(false);
  });

  describe('failure cases', () => {
    it('Set admin (not admin)', async () => {
      await expect(t.asset.methods.set_admin(t.adminAddress).simulate({ from: t.adminAddress })).rejects.toThrow(
        'Assertion failed: caller is not admin',
      );
    });
    it('Revoke minter not as admin', async () => {
      await expect(
        t.asset.methods.set_minter(t.adminAddress, false).simulate({ from: t.adminAddress }),
      ).rejects.toThrow('Assertion failed: caller is not admin');
    });
  });
});
