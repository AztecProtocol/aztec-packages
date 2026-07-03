import { AztecAddress, CompleteAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { TokenContract, type Transfer } from '@aztec/noir-contracts.js/Token';

import { type AlertConfig, GrafanaClient } from '../../quality_of_service/grafana_client.js';
import { TokenContractTest } from './token_contract_test.js';
import {
  assertAuthwitProxyReplayRejected,
  assertPublicAuthwitReplayRejected,
  halfBalanceOf,
} from './token_test_helpers.js';

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

// Happy-path coverage for all five Token transfer entrypoints (transfer, transfer_in_private,
// transfer_in_public, transfer_to_private, transfer_to_public): balance movements, private Transfer event
// emission, and on-behalf-of delegation with single-use replay protection. Failure cases live in
// transfer_failures.test.ts. Setup: single node with AutomineSequencer, 3 accounts + authwit proxy, Token
// deployed with initial public and private mint.
describe('automine/token/transfer', () => {
  const t = new TokenContractTest('transfer');
  let { asset, adminAddress, wallet, account1Address, tokenSim } = t;

  beforeAll(async () => {
    t.applyBaseSnapshots();
    t.applyMintSnapshot();
    await t.setup();
    ({ asset, adminAddress, wallet, account1Address, tokenSim } = t);
  });

  afterAll(async () => {
    await t.teardown();
    // Public transfers here exercise the public executor; when CHECK_ALERTS is set (e2e_test_with_alerts.sh)
    // validate the mana-per-second metric was emitted. Previously lived on transfer_in_public.test.ts.
    if (CHECK_ALERTS) {
      const alertChecker = new GrafanaClient(t.logger);
      await alertChecker.runAlertCheck(qosAlerts);
    }
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  // Top-level private-to-private transfer() entry point.
  describe('transfer', () => {
    // Transfers half of admin's private balance to account1, verifies via TokenSimulator, and asserts that
    // the private Transfer event is emitted and readable in the recipient's scope.
    it('transfer less than balance', async () => {
      const amount = await halfBalanceOf(asset, 'private', adminAddress);

      const { receipt: txReceipt } = await asset.methods.transfer(account1Address, amount).send({ from: adminAddress });
      tokenSim.transferPrivate(adminAddress, account1Address, amount);

      const events = await wallet.getPrivateEvents<Transfer>(TokenContract.events.Transfer, {
        contractAddress: asset.address,
        fromBlock: txReceipt.blockNumber!,
        toBlock: BlockNumber(txReceipt.blockNumber! + 1),
        scopes: [account1Address],
      });

      expect(events[0]).toEqual({
        event: {
          from: adminAddress,
          to: account1Address,
          amount: amount,
        },
        metadata: {
          l2BlockNumber: txReceipt.blockNumber,
          l2BlockHash: txReceipt.blockHash,
          txHash: txReceipt.txHash,
        },
      });
    });

    // Transfers to a randomly generated non-deployed address. Because the recipient's keys aren't in the PXE,
    // the note can't be decrypted; TokenSimulator models this as a transfer to AztecAddress.ZERO.
    it('transfer less than balance to non-deployed account', async () => {
      const amount = await halfBalanceOf(asset, 'private', adminAddress);

      const nonDeployed = await CompleteAddress.random();

      await asset.methods.transfer(nonDeployed.address, amount).send({ from: adminAddress });

      // Add the account as balance we should change, but since we don't have the key,
      // we cannot decrypt, and instead we simulate a transfer to address(0)
      tokenSim.addAccount(nonDeployed.address);
      tokenSim.transferPrivate(adminAddress, AztecAddress.ZERO, amount);
    });

    // Transfers half of admin's balance to themselves and verifies the balance is unchanged.
    it('transfer to self', async () => {
      const amount = await halfBalanceOf(asset, 'private', adminAddress);
      await asset.methods.transfer(adminAddress, amount).send({ from: adminAddress });
      tokenSim.transferPrivate(adminAddress, adminAddress, amount);
    });
  });

  // Private transfer delegated to a caller via a private authwit consumed through the proxy.
  describe('transfer_in_private', () => {
    // Creates a private authwit for transfer_in_private, sends through proxy, verifies TokenSimulator,
    // then confirms replay reverts with a duplicate-nullifier error.
    it('transfer on behalf of other', async () => {
      const amount = await halfBalanceOf(asset, 'private', adminAddress);
      const action = asset.methods.transfer_in_private(adminAddress, account1Address, amount, Fr.random());
      await assertAuthwitProxyReplayRejected(t.authwitProxy, wallet, adminAddress, action, () =>
        tokenSim.transferPrivate(adminAddress, account1Address, amount),
      );
    });
  });

  // Public transfer, direct and delegated via a public authwit.
  describe('transfer_in_public', () => {
    // Transfers half of admin's public balance to account1 and verifies via TokenSimulator.
    it('transfer less than balance', async () => {
      const amount = await halfBalanceOf(asset, 'public', adminAddress);
      await asset.methods.transfer_in_public(adminAddress, account1Address, amount, 0).send({ from: adminAddress });
      tokenSim.transferPublic(adminAddress, account1Address, amount);
    });

    // Transfers half of admin's public balance to themselves; verifies balance is unchanged via TokenSimulator.
    it('transfer to self', async () => {
      const amount = await halfBalanceOf(asset, 'public', adminAddress);
      await asset.methods.transfer_in_public(adminAddress, adminAddress, amount, 0).send({ from: adminAddress });
      tokenSim.transferPublic(adminAddress, adminAddress, amount);
    });

    // Sets a public authwit allowing account1 to transfer admin's tokens, executes, verifies TokenSimulator,
    // then confirms replay reverts with unauthorized.
    it('transfer on behalf of other', async () => {
      const amount = await halfBalanceOf(asset, 'public', adminAddress);
      const action = asset.methods.transfer_in_public(adminAddress, account1Address, amount, Fr.random());
      await assertPublicAuthwitReplayRejected(wallet, adminAddress, action, account1Address, () =>
        tokenSim.transferPublic(adminAddress, account1Address, amount),
      );
    });
  });

  // Public-to-private transfer (no on-behalf-of surface — takes no caller param).
  describe('transfer_to_private', () => {
    // Transfers half of admin's public balance to admin's own private balance and verifies via TokenSimulator.
    it('to self', async () => {
      const amount = await halfBalanceOf(asset, 'public', adminAddress);
      await asset.methods.transfer_to_private(adminAddress, amount).send({ from: adminAddress });
      tokenSim.transferToPrivate(adminAddress, adminAddress, amount);
    });

    // Transfers half of admin's public balance to account1's private balance and verifies via TokenSimulator.
    it('to someone else', async () => {
      const amount = await halfBalanceOf(asset, 'public', adminAddress);
      await asset.methods.transfer_to_private(account1Address, amount).send({ from: adminAddress });
      tokenSim.transferToPrivate(adminAddress, account1Address, amount);
    });
  });

  // Private-to-public transfer, direct and delegated via a private authwit consumed through the proxy.
  describe('transfer_to_public', () => {
    // Transfers half of admin's private balance to admin's public balance and verifies via TokenSimulator.
    it('on behalf of self', async () => {
      const amount = await halfBalanceOf(asset, 'private', adminAddress);
      await asset.methods.transfer_to_public(adminAddress, adminAddress, amount, 0).send({ from: adminAddress });
      tokenSim.transferToPublic(adminAddress, adminAddress, amount);
    });

    // Creates a private authwit for transfer_to_public to account1, sends through proxy, verifies
    // TokenSimulator, then asserts replay reverts with a duplicate-nullifier error.
    it('on behalf of other', async () => {
      const amount = await halfBalanceOf(asset, 'private', adminAddress);
      const action = asset.methods.transfer_to_public(adminAddress, account1Address, amount, Fr.random());
      await assertAuthwitProxyReplayRejected(t.authwitProxy, wallet, adminAddress, action, () =>
        tokenSim.transferToPublic(adminAddress, account1Address, amount),
      );
    });
  });
});
