import { TokenContractTest } from './token_contract_test.js';

// Covers admin and minter role management on the Token contract: set_admin, set_minter, and failure cases
// when called by a non-admin. Setup: single node with AutomineSequencer (AUTOMINE_E2E_OPTS), 3 accounts
// deployed, Token contract deployed. No time-warp needed (Token has no role-change delay).
describe('automine/token/access_control', () => {
  const t = new TokenContractTest('access_control');

  beforeAll(async () => {
    t.applyBaseSnapshots();
    await t.setup();
  });

  afterAll(async () => {
    await t.teardown();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  // Sets account1 as the new admin via set_admin, then reads back the admin via get_admin.
  it('Set admin', async () => {
    await t.asset.methods.set_admin(t.account1Address).send({ from: t.adminAddress });
    expect((await t.asset.methods.get_admin().simulate({ from: t.adminAddress })).result).toBe(
      t.account1Address.toBigInt(),
    );
  });

  // Grants minter role to account1 (now admin) via set_minter(true) and verifies via is_minter.
  it('Add minter as admin', async () => {
    await t.asset.methods.set_minter(t.account1Address, true).send({ from: t.account1Address });
    expect((await t.asset.methods.is_minter(t.account1Address).simulate({ from: t.adminAddress })).result).toBe(true);
  });

  // Revokes minter role from account1 via set_minter(false) and verifies via is_minter.
  it('Revoke minter as admin', async () => {
    await t.asset.methods.set_minter(t.account1Address, false).send({ from: t.account1Address });
    expect((await t.asset.methods.is_minter(t.account1Address).simulate({ from: t.adminAddress })).result).toBe(false);
  });

  // Error cases: unauthorized set_admin and unauthorized set_minter.
  describe('failure cases', () => {
    // Attempts set_admin from the original admin address (which is no longer admin); expects 'caller is not admin'.
    it('Set admin (not admin)', async () => {
      await expect(t.asset.methods.set_admin(t.adminAddress).simulate({ from: t.adminAddress })).rejects.toThrow(
        'Assertion failed: caller is not admin',
      );
    });
    // Attempts set_minter from the original admin address (which is no longer admin); expects 'caller is not admin'.
    it('Revoke minter not as admin', async () => {
      await expect(
        t.asset.methods.set_minter(t.adminAddress, false).simulate({ from: t.adminAddress }),
      ).rejects.toThrow('Assertion failed: caller is not admin');
    });
  });
});
