import { AztecAddress } from '@aztec/aztec.js/addresses';

import { BlacklistTokenContractTest, Role } from './blacklist_token_contract_test.js';

// TODO(kill-non-pipelined): each test body calls crossTimestampOfChange (86400s = 7200 slots at
// aztecSlotDuration=12s). The shared warpL2TimeAtLeastBy helper warps L1 then loops mineBlock to
// catch L2 up — under pipelining the cascading in-flight publishers across 7200 slots stall the
// build loop and on subsequent tests we see "Fork not found"/"Block hash not found" reorg errors
// because the world-state forks built against pre-warp anchor blocks get orphaned. A pure L1-only
// warp was tried (resetBlockInterval: true, no L2 mineBlock) but fails identically — the in-flight
// pipelined proposal references a slot that's now ancient history and the wallet's
// expiration_timestamp anchored to pre-warp time is rejected as "Invalid expiration timestamp".
// Other blacklist suites only warp 1-2× (setup + applyMint) and survive; access_control warps 4+×
// and accumulates fork-orphaning. Needs sequencer-pipeline-aware huge-warp coordination (stop
// sequencer, warp, re-sync PXE/world-state, restart) which is out of scope for the test-side fix.
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
