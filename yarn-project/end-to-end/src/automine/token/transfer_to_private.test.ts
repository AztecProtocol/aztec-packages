import { U128_UNDERFLOW_ERROR } from '../../fixtures/fixtures.js';
import { TokenContractTest } from './token_contract_test.js';

// Covers the transfer_to_private entry point on Token contract (public→private), including self and
// cross-account transfers. Setup: single node with AutomineSequencer, 3 accounts, Token deployed with
// initial mint.
describe('automine/token/transfer_to_private', () => {
  const t = new TokenContractTest('transfer_to_private');
  let { asset, adminAddress, account1Address, tokenSim } = t;

  beforeAll(async () => {
    t.applyBaseSnapshots();
    t.applyMintSnapshot();
    await t.setup();
    // Have to destructure again to ensure we have latest refs.
    ({ asset, adminAddress, account1Address, tokenSim } = t);
  });

  afterAll(async () => {
    await t.teardown();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  // Transfers half of admin's public balance to admin's own private balance and verifies via TokenSimulator.
  it('to self', async () => {
    const { result: balancePub } = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
    const amount = balancePub / 2n;
    expect(amount).toBeGreaterThan(0n);

    await asset.methods.transfer_to_private(adminAddress, amount).send({ from: adminAddress });

    // Check that the result matches token sim
    tokenSim.transferToPrivate(adminAddress, adminAddress, amount);
    await tokenSim.check();
  });

  // Transfers half of admin's public balance to account1's private balance and verifies via TokenSimulator.
  it('to someone else', async () => {
    const { result: balancePub } = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
    const amount = balancePub / 2n;
    expect(amount).toBeGreaterThan(0n);

    await asset.methods.transfer_to_private(account1Address, amount).send({ from: adminAddress });

    // Check that the result matches token sim
    tokenSim.transferToPrivate(adminAddress, account1Address, amount);
    await tokenSim.check();
  });

  // Error paths for transfer_to_private.
  describe('failure cases', () => {
    // Attempts to transfer more than public balance to private; expects U128_UNDERFLOW_ERROR.
    it('to self (more than balance)', async () => {
      const { result: balancePub } = await asset.methods
        .balance_of_public(adminAddress)
        .simulate({ from: adminAddress });
      const amount = balancePub + 1n;
      expect(amount).toBeGreaterThan(0n);

      await expect(
        asset.methods.transfer_to_private(adminAddress, amount).simulate({ from: adminAddress }),
      ).rejects.toThrow(U128_UNDERFLOW_ERROR);
    });
  });
});
