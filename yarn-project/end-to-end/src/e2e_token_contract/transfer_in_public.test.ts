import { Fr } from '@aztec/aztec.js/fields';

import { AUTOMINE_E2E_OPTS, U128_UNDERFLOW_ERROR } from '../fixtures/fixtures.js';
import { type AlertConfig, GrafanaClient } from '../quality_of_service/grafana_client.js';
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

// Covers the transfer_in_public entry point on Token contract: direct, self, authwit-delegated, authwit
// cancellation (two flows), and bad-account validation. Also conditionally checks Grafana QoS alerts when
// CHECK_ALERTS=true. Setup: single node with AutomineSequencer, Token deployed with initial mint.
describe('e2e_token_contract transfer public', () => {
  const t = new TokenContractTest('transfer_in_public');
  let { asset, tokenSim, wallet, adminAddress, account1Address, badAccount } = t;

  beforeAll(async () => {
    t.applyBaseSnapshots();
    t.applyMintSnapshot();
    await t.setup({ ...AUTOMINE_E2E_OPTS });
    // Have to destructure again to ensure we have latest refs.
    ({ asset, tokenSim, wallet, adminAddress, account1Address, badAccount } = t);
  });

  afterAll(async () => {
    await t.teardown();
    if (CHECK_ALERTS) {
      const alertChecker = new GrafanaClient(t.logger);
      await alertChecker.runAlertCheck(qosAlerts);
    }
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  // Transfers half of admin's public balance to account1 and verifies via TokenSimulator.
  it('transfer less than balance', async () => {
    const { result: balance0 } = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
    const amount = balance0 / 2n;
    expect(amount).toBeGreaterThan(0n);
    await asset.methods.transfer_in_public(adminAddress, account1Address, amount, 0).send({ from: adminAddress });

    tokenSim.transferPublic(adminAddress, account1Address, amount);
  });

  // Transfers half of admin's public balance to themselves; verifies balance is unchanged via TokenSimulator.
  it('transfer to self', async () => {
    const { result: balance } = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
    const amount = balance / 2n;
    expect(amount).toBeGreaterThan(0n);
    await asset.methods.transfer_in_public(adminAddress, adminAddress, amount, 0).send({ from: adminAddress });

    tokenSim.transferPublic(adminAddress, adminAddress, amount);
  });

  // Sets a public authwit allowing account1 to transfer admin's tokens, executes, verifies TokenSimulator,
  // then confirms replay reverts with unauthorized.
  it('transfer on behalf of other', async () => {
    const { result: balance0 } = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
    const amount = balance0 / 2n;
    expect(amount).toBeGreaterThan(0n);
    const authwitNonce = Fr.random();

    const action = asset.methods.transfer_in_public(adminAddress, account1Address, amount, authwitNonce);

    const validateActionInteraction = await wallet.setPublicAuthWit(
      adminAddress,
      { caller: account1Address, action },
      true,
    );
    await validateActionInteraction.send();

    // Perform the transfer
    await action.send({ from: account1Address });

    tokenSim.transferPublic(adminAddress, account1Address, amount);

    // Check that the message hash is no longer valid.
    await expect(
      asset.methods
        .transfer_in_public(adminAddress, account1Address, amount, authwitNonce)
        .simulate({ from: account1Address }),
    ).rejects.toThrow(/unauthorized/);
  });

  // Error paths for transfer_in_public: overflow, nonce, no approval, over-balance via authwit, wrong
  // caller (two variants), authwit cancellation (two flows), and bad-account authwit validation.
  describe('failure cases', () => {
    // Attempts to transfer more than public balance; expects U128_UNDERFLOW_ERROR.
    it('transfer more than balance', async () => {
      const { result: balance0 } = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
      const amount = balance0 + 1n;
      const authwitNonce = 0;
      await expect(
        asset.methods
          .transfer_in_public(adminAddress, account1Address, amount, authwitNonce)
          .simulate({ from: adminAddress }),
      ).rejects.toThrow(U128_UNDERFLOW_ERROR);
    });

    // Self-transfer with nonce=1; expects the invalid-nonce assertion.
    it('transfer on behalf of self with non-zero nonce', async () => {
      const { result: balance0 } = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
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

    // Calls transfer_in_public from account1 without an authwit; expects unauthorized.
    it('transfer on behalf of other without "approval"', async () => {
      const { result: balance0 } = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
      const amount = balance0 + 1n;
      const authwitNonce = Fr.random();
      await expect(
        asset.methods
          .transfer_in_public(adminAddress, account1Address, amount, authwitNonce)
          .simulate({ from: account1Address }),
      ).rejects.toThrow(/unauthorized/);
    });

    // Approves a transfer exceeding balance via authwit; expects U128_UNDERFLOW_ERROR and verifies balances
    // unchanged.
    it('transfer more than balance on behalf of other', async () => {
      const { result: balance0 } = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
      const { result: balance1 } = await asset.methods
        .balance_of_public(account1Address)
        .simulate({ from: account1Address });
      const amount = balance0 + 1n;
      const authwitNonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      const action = asset.methods.transfer_in_public(adminAddress, account1Address, amount, authwitNonce);

      const intent = { caller: account1Address, action };
      // We need to compute the message we want to sign and add it to the wallet as approved
      const validateActionInteraction = await wallet.setPublicAuthWit(adminAddress, intent, true);
      await validateActionInteraction.send();

      const witness = await wallet.createAuthWit(adminAddress, { caller: account1Address, action });

      // Perform the transfer
      await expect(action.simulate({ from: account1Address, authWitnesses: [witness] })).rejects.toThrow(
        U128_UNDERFLOW_ERROR,
      );

      expect((await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress })).result).toEqual(
        balance0,
      );
      expect(
        (await asset.methods.balance_of_public(account1Address).simulate({ from: account1Address })).result,
      ).toEqual(balance1);
    });

    // Approves adminAddress as caller but executes from account1; expects unauthorized, balances unchanged.
    it('transfer on behalf of other, wrong designated caller', async () => {
      const { result: balance0 } = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
      const { result: balance1 } = await asset.methods
        .balance_of_public(account1Address)
        .simulate({ from: account1Address });
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
      await validateActionInteraction.send();

      // Perform the transfer
      await expect(action.simulate({ from: account1Address })).rejects.toThrow(/unauthorized/);

      expect((await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress })).result).toEqual(
        balance0,
      );
      expect(
        (await asset.methods.balance_of_public(account1Address).simulate({ from: account1Address })).result,
      ).toEqual(balance1);
    });

    // Duplicate of the preceding test — identical logic and title, likely a test authoring mistake.
    // Approves adminAddress as caller but executes from account1; expects unauthorized, balances unchanged.
    it('transfer on behalf of other, wrong designated caller', async () => {
      const { result: balance0 } = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
      const { result: balance1 } = await asset.methods
        .balance_of_public(account1Address)
        .simulate({ from: account1Address });
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
      await validateActionInteraction.send();

      // Perform the transfer
      await expect(action.simulate({ from: account1Address })).rejects.toThrow(/unauthorized/);

      expect((await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress })).result).toEqual(
        balance0,
      );
      expect(
        (await asset.methods.balance_of_public(account1Address).simulate({ from: account1Address })).result,
      ).toEqual(balance1);
    });

    // Grants a public authwit to account1, then revokes it via setPublicAuthWit(false), then confirms
    // the transfer simulation reverts with unauthorized (uses fixed method call form for simulate).
    it('transfer on behalf of other, cancelled authwit', async () => {
      const { result: balance0 } = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
      const amount = balance0 / 2n;
      expect(amount).toBeGreaterThan(0n);
      const authwitNonce = Fr.random();

      const action = asset.methods.transfer_in_public(adminAddress, account1Address, amount, authwitNonce);

      const validateActionInteraction = await wallet.setPublicAuthWit(
        adminAddress,
        { caller: account1Address, action },
        true,
      );
      await validateActionInteraction.send();

      const cancelActionInteraction = await wallet.setPublicAuthWit(
        adminAddress,
        { caller: account1Address, action },
        false,
      );
      await cancelActionInteraction.send();

      await expect(
        asset.methods
          .transfer_in_public(adminAddress, account1Address, amount, authwitNonce)
          .simulate({ from: account1Address }),
      ).rejects.toThrow(/unauthorized/);
    });

    // Same grant-and-revoke flow as 'cancelled authwit' but simulates via the action object directly rather
    // than re-constructing the method call — verifies both call forms produce unauthorized.
    it('transfer on behalf of other, cancelled authwit, flow 2', async () => {
      const { result: balance0 } = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
      const amount = balance0 / 2n;
      expect(amount).toBeGreaterThan(0n);
      const authwitNonce = Fr.random();

      const action = asset.methods.transfer_in_public(adminAddress, account1Address, amount, authwitNonce);

      const validateActionInteraction = await wallet.setPublicAuthWit(
        adminAddress,
        { caller: account1Address, action },
        true,
      );
      await validateActionInteraction.send();

      const cancelActionInteraction = await wallet.setPublicAuthWit(
        adminAddress,
        { caller: account1Address, action },
        false,
      );
      await cancelActionInteraction.send();

      await expect(action.simulate({ from: account1Address })).rejects.toThrow(/unauthorized/);
    });

    // Uses the InvalidAccount contract as the 'from' address; expects unauthorized because the bad contract
    // returns a malformed authwit validation value.
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
