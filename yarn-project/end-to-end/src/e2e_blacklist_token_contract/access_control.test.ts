import { AztecAddress } from '@aztec/aztec.js/addresses';

import { BlacklistTokenContractTest, Role } from './blacklist_token_contract_test.js';

describe('e2e_blacklist_token_contract access control', () => {
  const t = new BlacklistTokenContractTest('access_control');

  beforeAll(async () => {
    // TODO(palla/pipelining): blocked on B7 — see PIPELINING_GOTCHAS.md "Notes from Agent D".
    // access_control has 4x repeated huge warps so it's the worst case for the warp path, but
    // the warp itself is no longer the issue once B1+markAsProven+mineBlock-retry is applied —
    // the test fails on the first simulate() call after the warp because of B7.
    await t.setup();
  });

  afterAll(async () => {
    await t.teardown();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  it('grant mint permission to the admin', async () => {
    const adminMinterRole = new Role().withAdmin().withMinter();
    await t.asset.methods.update_roles(t.adminAddress, adminMinterRole.toNoirStruct()).send({ from: t.adminAddress });

    await t.crossTimestampOfChange();

    expect((await t.asset.methods.get_roles(t.adminAddress).simulate({ from: t.adminAddress })).result).toEqual(
      adminMinterRole.toNoirStruct(),
    );
  });

  it('create a new admin', async () => {
    const adminRole = new Role().withAdmin();
    await t.asset.methods.update_roles(t.otherAddress, adminRole.toNoirStruct()).send({ from: t.adminAddress });

    await t.crossTimestampOfChange();

    expect((await t.asset.methods.get_roles(t.otherAddress).simulate({ from: t.adminAddress })).result).toEqual(
      adminRole.toNoirStruct(),
    );
  });

  it('revoke the new admin', async () => {
    const noRole = new Role();
    await t.asset.methods.update_roles(t.otherAddress, noRole.toNoirStruct()).send({ from: t.adminAddress });

    await t.crossTimestampOfChange();

    expect((await t.asset.methods.get_roles(t.otherAddress).simulate({ from: t.adminAddress })).result).toEqual(
      noRole.toNoirStruct(),
    );
  });

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

  describe('failure cases', () => {
    it('set roles from non admin', async () => {
      const newRole = new Role().withAdmin().withAdmin();
      await expect(
        t.asset.methods
          .update_roles(await AztecAddress.random(), newRole.toNoirStruct())
          .simulate({ from: t.otherAddress }),
      ).rejects.toThrow('Assertion failed: caller is not admin');
    });

    it('revoke minter from non admin', async () => {
      const noRole = new Role();
      await expect(
        t.asset.methods.update_roles(t.adminAddress, noRole.toNoirStruct()).simulate({ from: t.otherAddress }),
      ).rejects.toThrow('Assertion failed: caller is not admin');
    });
  });
});
