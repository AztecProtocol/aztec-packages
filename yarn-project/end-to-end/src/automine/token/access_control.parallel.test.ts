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

  // Exercises the full admin/minter role narrative as one test: adminAddress hands admin to other,
  // other (now admin) grants itself minter, then revokes it. These steps form an ordered chain
  // (each builds on the previous), so they live in a single it() — the .parallel split runs every
  // top-level it() in its own isolated container, where separate ordered tests could not see each
  // other's state.
  it('Manages admin and minter roles', async () => {
    await t.asset.methods.set_admin(t.otherAddress).send({ from: t.adminAddress });
    expect((await t.asset.methods.get_admin().simulate({ from: t.adminAddress })).result).toBe(
      t.otherAddress.toBigInt(),
    );

    await t.asset.methods.set_minter(t.otherAddress, true).send({ from: t.otherAddress });
    expect((await t.asset.methods.is_minter(t.otherAddress).simulate({ from: t.adminAddress })).result).toBe(true);

    await t.asset.methods.set_minter(t.otherAddress, false).send({ from: t.otherAddress });
    expect((await t.asset.methods.is_minter(t.otherAddress).simulate({ from: t.adminAddress })).result).toBe(false);
  });

  // Error cases: unauthorized set_admin and unauthorized set_minter. These assert that calls from
  // t.adminAddress revert once it is no longer admin, so the block transfers admin to other in its
  // own beforeAll rather than relying on the 'Set admin' test above having run (CI runs tests in
  // isolation). The transfer is idempotent: it is skipped if admin was already moved.
  describe('failure cases', () => {
    beforeAll(async () => {
      const currentAdmin = (await t.asset.methods.get_admin().simulate({ from: t.adminAddress })).result;
      if (currentAdmin === t.adminAddress.toBigInt()) {
        await t.asset.methods.set_admin(t.otherAddress).send({ from: t.adminAddress });
      }
    });

    // Attempts set_admin from the original admin address (which is no longer admin); expects 'caller is not admin'.
    it('Set admin not as admin', async () => {
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
