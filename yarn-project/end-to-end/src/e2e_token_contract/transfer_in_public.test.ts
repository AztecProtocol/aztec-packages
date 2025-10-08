import { Fr } from '@aztec/aztec.js';

import { U128_UNDERFLOW_ERROR } from '../fixtures/fixtures.js';
import { AlertChecker, type AlertConfig } from '../quality_of_service/alert_checker.js';
import { TokenContractTest } from './token_contract_test.js';

const CHECK_ALERTS = process.env.CHECK_ALERTS === 'true';

const qosAlerts: AlertConfig[] = [
  {
    // Dummy alert to check that the metric is being emitted.
    // Separate benchmark tests will use dedicated machines with the published system requirements.
    alert: 'publishing_mana_per_second',
    expr: 'rate(aztec_public_executor_simulation_mana_per_second_per_second_sum[5m]) / rate(aztec_public_executor_simulation_mana_per_second_per_second_count[5m]) < 10',
    for: '5m',
    annotations: {},
    labels: {},
  },
];

describe('e2e_token_contract transfer public', () => {
  const t = new TokenContractTest('transfer_in_public');
  let { asset, tokenSim, wallet, adminAddress, account1Address, badAccount } = t;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyMintSnapshot();
    await t.setup();
    // Have to destructure again to ensure we have latest refs.
    ({ asset, tokenSim, wallet, adminAddress, account1Address, badAccount } = t);
  });

  afterAll(async () => {
    await t.teardown();
    if (CHECK_ALERTS) {
      const alertChecker = new AlertChecker(t.logger);
      await alertChecker.runAlertCheck(qosAlerts);
    }
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  it('transfer less than balance', async () => {
    const balance0 = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
    const amount = balance0 / 2n;
    expect(amount).toBeGreaterThan(0n);
    await asset.methods
      .transfer_in_public(adminAddress, account1Address, amount, 0)
      .send({ from: adminAddress })
      .wait();

    tokenSim.transferPublic(adminAddress, account1Address, amount);
  });

  it('transfer to self', async () => {
    const balance = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
    const amount = balance / 2n;
    expect(amount).toBeGreaterThan(0n);
    await asset.methods.transfer_in_public(adminAddress, adminAddress, amount, 0).send({ from: adminAddress }).wait();

    tokenSim.transferPublic(adminAddress, adminAddress, amount);
  });

  it('transfer on behalf of other', async () => {
    const balance0 = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
    const amount = balance0 / 2n;
    expect(amount).toBeGreaterThan(0n);
    const authwitNonce = Fr.random();

    const action = asset.methods.transfer_in_public(adminAddress, account1Address, amount, authwitNonce);

    const validateActionInteraction = await wallet.setPublicAuthWit(
      adminAddress,
      { caller: account1Address, action },
      true,
    );
    await validateActionInteraction.send().wait();

    // Perform the transfer
    await action.send({ from: account1Address }).wait();

    tokenSim.transferPublic(adminAddress, account1Address, amount);

    // Check that the message hash is no longer valid.
    await expect(
      asset.methods
        .transfer_in_public(adminAddress, account1Address, amount, authwitNonce)
        .simulate({ from: account1Address }),
    ).rejects.toThrow(/unauthorized/);
  });

  describe('failure cases', () => {
    it('transfer more than balance', async () => {
      const balance0 = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
      const amount = balance0 + 1n;
      const authwitNonce = 0;
      await expect(
        asset.methods
          .transfer_in_public(adminAddress, account1Address, amount, authwitNonce)
          .simulate({ from: adminAddress }),
      ).rejects.toThrow(U128_UNDERFLOW_ERROR);
    });

    it('transfer on behalf of self with non-zero nonce', async () => {
      const balance0 = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
      const amount = balance0 - 1n;
      const authwitNonce = 1;
      await expect(
        asset.methods
          .transfer_in_public(adminAddress, account1Address, amount, authwitNonce)
          .simulate({ from: adminAddress }),
      ).rejects.toThrow(
        "Assertion failed: Invalid authwit nonce. When 'from' and 'msg_sender' are the same, 'authwit_nonce' must be zero",
      );
    });

    it('transfer on behalf of other without "approval"', async () => {
      const balance0 = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
      const amount = balance0 + 1n;
      const authwitNonce = Fr.random();
      await expect(
        asset.methods
          .transfer_in_public(adminAddress, account1Address, amount, authwitNonce)
          .simulate({ from: account1Address }),
      ).rejects.toThrow(/unauthorized/);
    });

    it('transfer more than balance on behalf of other', async () => {
      const balance0 = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
      const balance1 = await asset.methods.balance_of_public(account1Address).simulate({ from: account1Address });
      const amount = balance0 + 1n;
      const authwitNonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      const action = asset.methods.transfer_in_public(adminAddress, account1Address, amount, authwitNonce);

      const intent = { caller: account1Address, action };
      // We need to compute the message we want to sign and add it to the wallet as approved
      const validateActionInteraction = await wallet.setPublicAuthWit(adminAddress, intent, true);
      await validateActionInteraction.send().wait();

      const witness = await wallet.createAuthWit(adminAddress, { caller: account1Address, action });

      // Perform the transfer
      await expect(action.simulate({ from: account1Address, authWitnesses: [witness] })).rejects.toThrow(
        U128_UNDERFLOW_ERROR,
      );

      expect(await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress })).toEqual(balance0);
      expect(await asset.methods.balance_of_public(account1Address).simulate({ from: account1Address })).toEqual(
        balance1,
      );
    });

    it('transfer on behalf of other, wrong designated caller', async () => {
      const balance0 = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
      const balance1 = await asset.methods.balance_of_public(account1Address).simulate({ from: account1Address });
      const amount = balance0 + 2n;
      const authwitNonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      // We need to compute the message we want to sign and add it to the wallet as approved
      const action = asset.methods.transfer_in_public(adminAddress, account1Address, amount, authwitNonce);

      const validateActionInteraction = await wallet.setPublicAuthWit(
        adminAddress,
        { caller: adminAddress, action },
        true,
      );
      await validateActionInteraction.send().wait();

      // Perform the transfer
      await expect(action.simulate({ from: account1Address })).rejects.toThrow(/unauthorized/);

      expect(await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress })).toEqual(balance0);
      expect(await asset.methods.balance_of_public(account1Address).simulate({ from: account1Address })).toEqual(
        balance1,
      );
    });

    it('transfer on behalf of other, wrong designated caller', async () => {
      const balance0 = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
      const balance1 = await asset.methods.balance_of_public(account1Address).simulate({ from: account1Address });
      const amount = balance0 + 2n;
      const authwitNonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      // We need to compute the message we want to sign and add it to the wallet as approved
      const action = asset.methods.transfer_in_public(adminAddress, account1Address, amount, authwitNonce);
      const validateActionInteraction = await wallet.setPublicAuthWit(
        adminAddress,
        { caller: adminAddress, action },
        true,
      );
      await validateActionInteraction.send().wait();

      // Perform the transfer
      await expect(action.simulate({ from: account1Address })).rejects.toThrow(/unauthorized/);

      expect(await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress })).toEqual(balance0);
      expect(await asset.methods.balance_of_public(account1Address).simulate({ from: account1Address })).toEqual(
        balance1,
      );
    });

    it('transfer on behalf of other, cancelled authwit', async () => {
      const balance0 = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
      const amount = balance0 / 2n;
      expect(amount).toBeGreaterThan(0n);
      const authwitNonce = Fr.random();

      const action = asset.methods.transfer_in_public(adminAddress, account1Address, amount, authwitNonce);

      const validateActionInteraction = await wallet.setPublicAuthWit(
        adminAddress,
        { caller: account1Address, action },
        true,
      );
      await validateActionInteraction.send().wait();

      const cancelActionInteraction = await wallet.setPublicAuthWit(
        adminAddress,
        { caller: account1Address, action },
        false,
      );
      await cancelActionInteraction.send().wait();

      await expect(
        asset.methods
          .transfer_in_public(adminAddress, account1Address, amount, authwitNonce)
          .simulate({ from: account1Address }),
      ).rejects.toThrow(/unauthorized/);
    });

    it('transfer on behalf of other, cancelled authwit, flow 2', async () => {
      const balance0 = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
      const amount = balance0 / 2n;
      expect(amount).toBeGreaterThan(0n);
      const authwitNonce = Fr.random();

      const action = asset.methods.transfer_in_public(adminAddress, account1Address, amount, authwitNonce);

      const validateActionInteraction = await wallet.setPublicAuthWit(
        adminAddress,
        { caller: account1Address, action },
        true,
      );
      await validateActionInteraction.send().wait();

      const cancelActionInteraction = await wallet.setPublicAuthWit(
        adminAddress,
        { caller: account1Address, action },
        false,
      );
      await cancelActionInteraction.send().wait();

      await expect(action.simulate({ from: account1Address })).rejects.toThrow(/unauthorized/);
    });

    it('transfer on behalf of other, invalid spend_public_authwit on "from"', async () => {
      const authwitNonce = Fr.random();

      await expect(
        asset.methods
          .transfer_in_public(badAccount.address, account1Address, 0, authwitNonce)
          .simulate({ from: account1Address }),
      ).rejects.toThrow(/unauthorized/);
    });

    it.skip('transfer into account to overflow', () => {
      // This should already be covered by the mint case earlier. e.g., since we cannot mint to overflow, there is not
      // a way to get funds enough to overflow.
      // Require direct storage manipulation for us to perform a nice explicit case though.
      // See https://github.com/AztecProtocol/aztec-packages/issues/1259
    });
  });
});
