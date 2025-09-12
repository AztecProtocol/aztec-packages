import { U128_UNDERFLOW_ERROR } from '../fixtures/fixtures.js';
import { TokenContractTest } from './token_contract_test.js';

describe('e2e_token_contract transfer_to_private', () => {
  const t = new TokenContractTest('transfer_to_private');
  let { asset, adminAddress, account1Address, tokenSim } = t;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyMintSnapshot();
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

  it('to self', async () => {
    const balancePub = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
    const amount = balancePub / 2n;
    expect(amount).toBeGreaterThan(0n);

    await asset.methods.transfer_to_private(adminAddress, amount).send({ from: adminAddress }).wait();

    // Check that the result matches token sim
    tokenSim.transferToPrivate(adminAddress, adminAddress, amount);
    await tokenSim.check();
  });

  it('to someone else', async () => {
    const balancePub = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
    const amount = balancePub / 2n;
    expect(amount).toBeGreaterThan(0n);

    await asset.methods.transfer_to_private(account1Address, amount).send({ from: adminAddress }).wait();

    // Check that the result matches token sim
    tokenSim.transferToPrivate(adminAddress, account1Address, amount);
    await tokenSim.check();
  });

  describe('failure cases', () => {
    it('to self (more than balance)', async () => {
      const balancePub = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
      const amount = balancePub + 1n;
      expect(amount).toBeGreaterThan(0n);

      await expect(
        asset.methods.transfer_to_private(adminAddress, amount).simulate({ from: adminAddress }),
      ).rejects.toThrow(U128_UNDERFLOW_ERROR);
    });
  });
});
