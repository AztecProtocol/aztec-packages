import { AztecAddress } from '@aztec/aztec.js/addresses';

import { BlacklistTokenContractTest, Role } from './blacklist_token_contract_test.js';

// TODO(kill-non-pipelined): each test body calls crossTimestampOfChange (86400s warp), so the suite warps the chain
// 4+ times. Under pipelining, after ~3 cumulative warps the L1-sync/snapshot path resets the L2 block index back to 1,
// breaking mineBlock's monotonic `newBlockNumber > currentBlockNumber` wait condition with a TimeoutError. Other
// blacklist suites warp at most twice (setup + applyMint) and are unaffected.
describe.skip('e2e_blacklist_token_contract access control', () => {
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
