import { AztecAddress } from '@aztec/aztec.js';

import { BlacklistTokenContractTest, Role } from './blacklist_token_contract_test.js';

describe('e2e_blacklist_token_contract access control', () => {
  const t = new BlacklistTokenContractTest('access_control');

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

  it('grant mint permission to the admin', async () => {
    const adminMinterRole = new Role().withAdmin().withMinter();
    await t.asset.methods
      .update_roles(t.adminAddress, adminMinterRole.toNoirStruct())
      .send({ from: t.adminAddress })
      .wait();

    await t.crossTimestampOfChange();

    expect(await t.asset.methods.get_roles(t.adminAddress).simulate({ from: t.adminAddress })).toEqual(
      adminMinterRole.toNoirStruct(),
    );
  });

  it('create a new admin', async () => {
    const adminRole = new Role().withAdmin();
    await t.asset.methods.update_roles(t.otherAddress, adminRole.toNoirStruct()).send({ from: t.adminAddress }).wait();

    await t.crossTimestampOfChange();

    expect(await t.asset.methods.get_roles(t.otherAddress).simulate({ from: t.adminAddress })).toEqual(
      adminRole.toNoirStruct(),
    );
  });

  it('revoke the new admin', async () => {
    const noRole = new Role();
    await t.asset.methods.update_roles(t.otherAddress, noRole.toNoirStruct()).send({ from: t.adminAddress }).wait();

    await t.crossTimestampOfChange();

    expect(await t.asset.methods.get_roles(t.otherAddress).simulate({ from: t.adminAddress })).toEqual(
      noRole.toNoirStruct(),
    );
  });

  it('blacklist account', async () => {
    const blacklistRole = new Role().withBlacklisted();
    await t.asset.methods
      .update_roles(t.blacklistedAddress, blacklistRole.toNoirStruct())
      .send({ from: t.adminAddress })
      .wait();

    await t.crossTimestampOfChange();

    expect(await t.asset.methods.get_roles(t.blacklistedAddress).simulate({ from: t.adminAddress })).toEqual(
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
