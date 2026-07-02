import { AztecAddress } from '@aztec/aztec.js/addresses';

import { BlacklistTokenContractTest, Role } from './blacklist_token_contract_test.js';

// Covers role management (admin grant/revoke, minter assignment, blacklisting) on the TokenBlacklist contract.
// Setup: single node with AutomineSequencer (AUTOMINE_E2E_OPTS), 3 deployed accounts (admin/other/blacklisted),
// TokenBlacklist contract deployed. Role changes require crossing a 86400s L2 time delay enforced by the
// contract; crossTimestampOfChange() handles this via markAsProven + warpL2TimeAtLeastBy.
describe('automine/token/blacklist_access_control', () => {
  const t = new BlacklistTokenContractTest('access_control');

  beforeAll(async () => {
    await t.setup();
  });

  afterAll(async () => {
    await t.teardown();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  // Sends update_roles to grant admin+minter to the admin account, crosses the 86400s delay, then asserts
  // the role is readable via get_roles.
  it('grant mint permission to the admin', async () => {
    const adminMinterRole = new Role().withAdmin().withMinter();
    await t.asset.methods.update_roles(t.adminAddress, adminMinterRole.toNoirStruct()).send({ from: t.adminAddress });

    await t.crossTimestampOfChange();

    expect((await t.asset.methods.get_roles(t.adminAddress).simulate({ from: t.adminAddress })).result).toEqual(
      adminMinterRole.toNoirStruct(),
    );
  });

  // Grants admin role to the 'other' account, crosses the delay, and verifies the role via get_roles.
  it('create a new admin', async () => {
    const adminRole = new Role().withAdmin();
    await t.asset.methods.update_roles(t.otherAddress, adminRole.toNoirStruct()).send({ from: t.adminAddress });

    await t.crossTimestampOfChange();

    expect((await t.asset.methods.get_roles(t.otherAddress).simulate({ from: t.adminAddress })).result).toEqual(
      adminRole.toNoirStruct(),
    );
  });

  // Clears the 'other' account's roles via update_roles, crosses the delay, and verifies the empty role.
  it('revoke the new admin', async () => {
    const noRole = new Role();
    await t.asset.methods.update_roles(t.otherAddress, noRole.toNoirStruct()).send({ from: t.adminAddress });

    await t.crossTimestampOfChange();

    expect((await t.asset.methods.get_roles(t.otherAddress).simulate({ from: t.adminAddress })).result).toEqual(
      noRole.toNoirStruct(),
    );
  });

  // Assigns blacklisted role to the dedicated blacklistedAddress, crosses the delay, and reads back the role.
  it('blacklist account', async () => {
    const blacklistRole = new Role().withBlacklisted();
    await t.asset.methods
      .update_roles(t.blacklistedAddress, blacklistRole.toNoirStruct())
      .send({ from: t.adminAddress });

    await t.crossTimestampOfChange();

    expect((await t.asset.methods.get_roles(t.blacklistedAddress).simulate({ from: t.adminAddress })).result).toEqual(
      blacklistRole.toNoirStruct(),
    );
  });

  // Verifies that update_roles reverts when called by a non-admin account.
  describe('failure cases', () => {
    // Calls update_roles from otherAddress (not admin) and expects the 'caller is not admin' assertion failure.
    it('set roles from non admin', async () => {
      const newRole = new Role().withAdmin().withAdmin();
      await expect(
        t.asset.methods
          .update_roles(await AztecAddress.random(), newRole.toNoirStruct())
          .simulate({ from: t.otherAddress }),
      ).rejects.toThrow('Assertion failed: caller is not admin');
    });

    // Attempts to revoke admin's minter role from otherAddress and expects the 'caller is not admin' error.
    it('revoke minter from non admin', async () => {
      const noRole = new Role();
      await expect(
        t.asset.methods.update_roles(t.adminAddress, noRole.toNoirStruct()).simulate({ from: t.otherAddress }),
      ).rejects.toThrow('Assertion failed: caller is not admin');
    });
  });
});
